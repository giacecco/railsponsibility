var NO_EVENTS_WARNING = 5; // minutes
 
var async = require('async'),
    stompit = require('stompit'),
    Uploader = require('s3-upload-stream').Uploader,
    utils = require('./utils'),
    _ = require('underscore');

var CONNECTION_PARAMETERS = {
            'host': 'datafeeds.networkrail.co.uk', 
            'port': 61618, 
            'connectHeaders': {
                'host': '/',
                'login': process.env.NROD_USERNAME,
                'passcode': process.env.NROD_PASSWORD,
                'client-id': process.env.NROD_USERNAME,
            }
        },
    SUBSCRIPTION_PARAMETERS = {
            'destination': '/topic/TRAIN_MVT_ALL_TOC',
            'ack': 'client-individual',
            'activemq.subscriptionName': ((process.env.DEBUG === 'TRUE') ? 'debug' : 'prod') + '-' + process.env.NROD_USERNAME,
        };

var generateFilename = function () {
    var d = new Date();
    return 'arrivals_' + d.getFullYear() + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + (d.getDate() < 10 ? '0' : '') + d.getDate() + (d.getHours() < 10 ? '0' : '') + d.getHours() + '.json';
};

module.exports = function (options) {

    var filename = null,
        uploadStream = null,
        firstBatch = null,
        latestEventsTimestamp = null,
        latestWrittenEventsTimestamp = null;

    var arrivalsProcessingQueue = async.queue(function (event, callback) {

        var createUploadStreamObject = function (callback) {
            if (filename) {
                // if a file was being written, I write the closing bracket
                uploadStream.write(']');
                uploadStream.end();
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
                                utils.log("arrivalsMonitor: starting archive file " + filename + " ...");
                            });
                            firstBatch = true;
                            callback(null);
                        }
                    }
                );
        };

        var write = function() {
            latestWrittenEventsTimestamp = new Date();
            if (firstBatch) {
                uploadStream.write("[");
                firstBatch = false;
            } else {
                uploadStream.write(",\n");
            }
            uploadStream.write(JSON.stringify(event));
            callback();
        }

        if (!latestWrittenEventsTimestamp || (latestWrittenEventsTimestamp.getHours() !== (new Date()).getHours())) {
            createUploadStreamObject(write);
        }  else {
            write();
        }

    }, 1);

    var initialise = function () {

        setInterval(function () {
        	if (latestEventsTimestamp && ((new Date()).getTime() - latestEventsTimestamp.getTime() > NO_EVENTS_WARNING * 60000)) {
        		utils.log("arrivalsMonitor: *** WARNING: more than " + NO_EVENTS_WARNING + " minutes without receiving events from the server.");		
        	}
        }, 60000);

        stompit.connect(CONNECTION_PARAMETERS, function (err, client) {
            if (err) {
                utils.log('arrivalsMonitor: unable to connect listener to National Rail server - ' + err.message);
                return;
            }
            utils.log("arrivalsMonitor: listener started.");
            client.subscribe(SUBSCRIPTION_PARAMETERS, function (err, message) {
                if (err) {
                    utils.log('arrivalsMonitor: error receiving message - ' + err.message);
                    return;
                }
                var content = '',
                    chunk;
                message.on('readable', function () {
                        while (null !== (chunk = message.read())) {
                            content += chunk;
                        }
                    });
                message.on('end', function () {
                        message.ack();
                        latestEventsTimestamp = new Date();
                        arrivalsProcessingQueue.push(JSON.parse(content).filter(function (e) { return e.body.event_type === 'ARRIVAL'; }), function (err) { });
                    });
            });
        });
    };

    initialise();
    return { };
};

