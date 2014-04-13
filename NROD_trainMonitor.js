var async = require('async'),
    fs = require('fs'),
    Stomp = require('stomp-client'),
    path = require('path'),
    scheduleReader = require('./NROD_scheduleReader'),
    utils = require('./utils'),
	_ = require('underscore');

var SECRET = JSON.parse(fs.readFileSync(path.join(__dirname, 'NROD_SECRET.json'))),
    STATION_CODES = null,
    client = new Stomp('datafeeds.networkrail.co.uk', 61618, SECRET.username, SECRET.password),
    monitoredTrains = { };

var TrainMonitor = function (fromStationCode, toStationCode, aimedDepartureTime, callback) {
    utils.log("Looking for schedule for train from " + fromStationCode + " to " + toStationCode + " at " + aimedDepartureTime + "...");
    scheduleReader.getSchedule('BERKHMD', 'EUSTON', { 'dateTime': new Date(), 'limitTo': 1 }, function (err, result) { 
        var result = result[0],
            trainKey = toStationCode + '_' + result.stops.filter(function (s) { return s.tiploc_code === toStationCode; }).arrival.getTime();
        utils.log("Identified schedule for train from " + fromStationCode + " to " + toStationCode + " at " + aimedDepartureTime + ": service " + result.service + " at " + result.stops.filter(function (s) { return s.tiploc_code === fromStationCode; }).departure);
        if (!monitoredTrains[trainKey]) monitoredTrains[trainKey] = {
            callbacks: [ ],
        };
        monitoredTrains[trainKey].callbacks.push(callback);
    });
};

exports.create = function (fromStationCode, toStationCode, aimedDepartureTime, callback) {
    return new TrainMonitor(fromStationCode, toStationCode, aimedDepartureTime, callback);
};

client.connect(function (sessionId) {
    client.subscribe('/topic/TRAIN_MVT_ALL_TOC', function (events, headers) {
        events = async.reduce(JSON.parse(events), [ ], function (memo, event, callback) { 
            if (!event.body.loc_stanox || (event.body.event_type !== 'ARRIVAL')) {
                callback(null, memo);
            } else {
                utils.stanox2tiploc(event.body.loc_stanox, function (err, tiploc) {
                    if (tiploc) {
                        event = event.body;
                        event.loc_tiploc = tiploc;
                        // NOTE: I presume that where gbtt_timestamp is not defined, it 
                        // is the same as planned_timestamp
                        event.gbtt_timestamp = event.gbtt_timestamp || event.planned_timestamp;
                        // I correct all dates to remove the BST correction

                        memo.push(event);
                    }
                    callback(null, memo);
                });
            }
        }, function (err, arrivals) {
            arrivals.forEach(function (arrival) {
                utils.log(arrival.loc_tiploc + ": arrival of service " + arrival.train_service_code + " at " + arrival.actual_timestamp + " rather than " + arrival.gbtt_timestamp);
                // TODO: the timestamps in the TRAIN_MVT_ALL_TOC feed is 
                // adjusted for BST! I need to bring it back to GMT
                var trainKey = arrival.loc_tiploc + '_' + parseInt(arrival.gbtt_timestamp + 24 * 60 * 60000);
                if (monitoredTrains[trainKey]) {
                    // call all the callbacks!
                }
            });
        });
    });
});
