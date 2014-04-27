var NO_EVENTS_WARNING = 5; // minutes

var argv = require('yargs')
        .demand([ 'out' ])
        .alias('out', 'o')
        .default('out', '.')
        .argv,
    csvstringify = require('csv-stringify'),
	es = require('event-stream'),
	Stomp = require('stomp-client'),
    Uploader = require('s3-upload-stream').Uploader,
	utils = require('../utils'),
	_ = require('underscore');

var listener = new Stomp('datafeeds.networkrail.co.uk', 61618, process.env.NROD_USERNAME, process.env.NROD_PASSWORD),
    latestEventsTimestamp = null;

var dateToCSVDate = function (d) {
	return d.getFullYear() + "/" + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + "/" + (d.getDate() < 10 ? '0' : '') + d.getDate() + " " + (d.getHours() < 10 ? '0' : '') + d.getHours() + ":" + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() + ":" + (d.getSeconds() < 10 ? '0' : '') + d.getSeconds();
}

var generateFilename = function () {
    var d = new Date();
    return d.getFullYear() + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + (d.getDate() < 10 ? '0' : '') + d.getDate() + (d.getHours() < 10 ? '0' : '') + d.getHours() + '.csv';
}

setInterval(function () {
	if (latestEventsTimestamp && ((new Date()).getTime() - latestEventsTimestamp.getTime() > NO_EVENTS_WARNING * 60000)) {
		console.log("\n*** WARNING: more than " + NO_EVENTS_WARNING + " minutes without receiving events from the server.");		
	}
}, 60000);

listener.connect(
    // success callback
    function (sessionId) { 
    	var csvstringifier = csvstringify({ 'header': true }),
    		outStream = null,
    		inStream = null,
            uploadStream = null,
            header = null,
            latestWrittenEventsTimestamp = null;
    	console.log("Listener started.");
        listener.subscribe('/topic/TRAIN_MVT_ALL_TOC', function (events, headers) {

            var createUploadStreamObject = function (callback) {
                var UploadStreamObject = new Uploader(
                    { 
                        "accessKeyId": process.env.AWS_ACCESS_KEY_ID,
                        "secretAccessKey": process.env.AWS_SECURE_ACCESS_KEY,
                    },
                    {
                        "Bucket": process.env.AWS_ARRIVALS_ARCHIVE_BUCKET_NAME,
                        "Key": generateFilename(),
                    },
                    function (err, newUploadStream) {
                        if(err)
                            console.log(err, newUploadStream);
                        else {
                            uploadStream = newUploadStream;
                            uploadStream.on('chunk', function (data) {
                                console.log("a single part of the stream is uploaded");
                            });
                            uploadStream.on('uploaded', function (data) {
                                console.log("all parts have been flushed to S3 and the multipart upload has been finalized");
                            });
                            // read.pipe(uploadStream);
                            inStream = es.through(function write(data) {
                                    this.emit('data', data);
                                },
                                function end () { //optional
                                    this.emit('end')
                                });
                            header = true;
                            inStream.pipe(uploadStream);
                            callback(null);
                        }
                    }
                );
            };

            var writeEvents = function () {
                latestWrittenEventsTimestamp = new Date();                
                es.readArray(events.map(function (e) {
                        var newE = { };
                        [ 'header', 'body' ].forEach(function (firstLevel) {
                            Object.keys(e[firstLevel]).forEach(function (secondLevel) {
                                newE[firstLevel + '_' + secondLevel] = e[firstLevel][secondLevel];
                            });
                        });
                        return newE;
                    }))
                    // .pipe(csvstringifier)
                    // TODO: the code below is an ugly replacement for 
                    // csv-stringify, awaiting response to 
                    // https://github.com/wdavidw/node-csv-stringify/issues/2
                    .pipe(es.mapSync(function (data) {
                        var output = "";
                        if (header) {
                            output += Object.keys(data).sort().map(function (propertyName) { return '"' + propertyName + '"'; }).join(",") + "\n";
                            header = false;
                        }
                        output += Object.keys(data).sort().map(function (propertyName) {
                            return data[propertyName] ? JSON.stringify(data[propertyName]) : '""';
                        }).join(",") + "\n";
                        return output;
                    }))
                    .pipe(inStream);
            }

        	process.stdout.write('.');
            latestEventsTimestamp = new Date();                
    		events = JSON.parse(events)
    			.filter(function (e) { 
                        return (e.body.event_type === 'ARRIVAL') && (parseInt(e.body.actual_timestamp) > parseInt(e.body.gbtt_timestamp || e.body.planned_timestamp)); 
                    });
            if (events.length > 0) {
                // there's something to write!
                if (!latestWrittenEventsTimestamp || (latestWrittenEventsTimestamp.getHours() !== (new Date()).getHours())) {
                    // date change! change filename
                    createUploadStreamObject(writeEvents);
                }  else {
                    writeEvents();
                }
            }                
        }); 
    },
    // error callback
    // TODO: perhaps I could make this more resilient rather than just exiting
    function (err) { throw err; }
);        
