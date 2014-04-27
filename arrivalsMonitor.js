var NO_EVENTS_WARNING = 5; // minutes

var es = require('event-stream'),
    Stomp = require('stomp-client'),
    Uploader = require('s3-upload-stream').Uploader,
    utils = require('./utils'),
    _ = require('underscore');

var generateFilename = function () {
    var d = new Date();
    return 'arrivals_' + d.getFullYear() + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + (d.getDate() < 10 ? '0' : '') + d.getDate() + (d.getHours() < 10 ? '0' : '') + d.getHours() + '.json';
};

module.exports = function (options) {

    var listener = new Stomp('datafeeds.networkrail.co.uk', 61618, process.env.NROD_USERNAME, process.env.NROD_PASSWORD),
        latestEventsTimestamp = null;

    var initialise = function () {

        setInterval(function () {
        	if (latestEventsTimestamp && ((new Date()).getTime() - latestEventsTimestamp.getTime() > NO_EVENTS_WARNING * 60000)) {
        		utils.log("arrivalsMonitor: *** WARNING: more than " + NO_EVENTS_WARNING + " minutes without receiving events from the server.");		
        	}
        }, 60000);

        listener.connect(
            // success callback
            function (sessionId) { 
            	var filename = null,
                    inStream = null,
                    uploadStream = null,
                    latestWrittenEventsTimestamp = null;
            	utils.log("arrivalsMonitor: listener started.");
                listener.subscribe('/topic/TRAIN_MVT_ALL_TOC', function (events, headers) {

                    var createUploadStreamObject = function (callback) {
                        if (filename) {
                            // if a file was being written, I write the closing 
                            // bracket
                            uploadStream.write(']');
                            utils.log("arrivalsMonitor: completed archive file " + filename + ".");
                        }
                        filename = generateFilename();
                        var UploadStreamObject = new Uploader(
                                { 
                                    "accessKeyId": process.env.AWS_ACCESS_KEY_ID,
                                    "secretAccessKey": process.env.AWS_SECURE_ACCESS_KEY,
                                },
                                {
                                    "Bucket": process.env.AWS_ARRIVALS_ARCHIVE_BUCKET_NAME,
                                    "Key": filename,
                                    "ACL": 'public-read',
                                    "StorageClass": 'REDUCED_REDUNDANCY',
                                },
                                function (err, newUploadStream) {
                                    if (err) {
                                        utils.log("arrivalsMonitor: *** ERROR creating uploading stream to Amazon S3 - " + JSON.stringify(err));
                                        throw err;
                                    } else {
                                        uploadStream = newUploadStream;
                                        uploadStream.on('uploaded', function (data) {
                                            utils.log("arrivalsMonitor: uploading archive file " + filename + " ...");
                                        });
                                        inStream = es.through(function write(data) {
                                                this.emit('data', data);
                                            },
                                            function end () { 
                                                this.emit('end')
                                            });
                                        uploadStream.write('[');
                                        inStream.pipe(uploadStream);
                                        callback(null);
                                    }
                                }
                            );
                    };

                    var processArrivals = function () {
                        // I call the arrivals callback
                        if (options.arrivalsCallback) options.arrivalsCallback(events);
                        // I write the archive logs to Amazon S3          
                        latestWrittenEventsTimestamp = new Date();    
                        es.readArray(events)
                            .pipe(es.stringify())
                            .pipe(es.join(','))
                            .pipe(inStream);
                    }

                    latestEventsTimestamp = new Date();                
            		events = JSON.parse(events)
                        .filter(function (e) { return (e.body.event_type === 'ARRIVAL'); });
                    if (events.length > 0) {
                        if (!latestWrittenEventsTimestamp || (latestWrittenEventsTimestamp.getHours() !== (new Date()).getHours())) {
                            createUploadStreamObject(processArrivals);
                        }  else {
                            processArrivals();
                        }
                    }                
                }); 
            },
            // error callback
            // TODO: perhaps I could make this more resilient rather than just exiting
            function (err) { throw err; }
        );        

    };

    initialise();
    return { };
};

