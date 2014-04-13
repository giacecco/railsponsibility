var async = require('async'),
    fs = require('fs'),
    Stomp = require('stomp-client'),
    path = require('path'),
    scheduleReader = require('./NROD_scheduleReader'),
    utils = require('./utils'),
	_ = require('underscore');

var SECRET = JSON.parse(fs.readFileSync(path.join(__dirname, 'NROD_SECRET.json'))),
    STATION_CODES = null,
    listener = new Stomp('datafeeds.networkrail.co.uk', 61618, SECRET.username, SECRET.password),
    listenerIsOn = false,
    monitoredTrains = { };

var initialise = function (callback) {
    if (listenerIsOn) { callback(); return; } 
    listenerIsOn = true;
    listener.connect(function (sessionId) {
        listener.subscribe('/topic/TRAIN_MVT_ALL_TOC', function (events, headers) {
            events = async.reduce(JSON.parse(events), [ ], function (memo, event, callback) { 
                if (!event.body.loc_stanox || (event.body.event_type !== 'ARRIVAL')) {
                    callback(null, memo);
                } else {
                    utils.stanox2tiploc(event.body.loc_stanox, function (err, tiploc) {
                        if (tiploc) {
                            event = event.body;
                            event.loc_tiploc = tiploc;
                            [ 'original_loc_timestamp', 'gbtt_timestamp', 'planned_timestamp', 'actual_timestamp' ].forEach(function (propertyName) {
                                if (event[propertyName]) {
                                    event[propertyName] = new Date(parseInt(event[propertyName]));
                                    // the timestamps in the TRAIN_MVT_ALL_TOC feed  
                                    // are adjusted for BST, the line below should
                                    // assure conversion is correct
                                    event[propertyName].setMinutes(event[propertyName].getMinutes() + event[propertyName].getTimezoneOffset());
                                }
                            });
                            // NOTE: 
                            // a) I presume that where gbtt_timestamp is not 
                            //    defined, it is the same as planned_timestamp, 
                            //    rounded to the next minute if necessary
                            // b) there are trains that have no planned_timestamp
                            //    anyway! I just give up on them
                            if (!event.gbtt_timestamp && event.planned_timestamp) {
                                event.gbtt_timestamp = event.planned_timestamp;
                                if (event.gbtt_timestamp.getSeconds() > 0) {
                                    event.gbtt_timestamp.setMinutes(event.gbtt_timestamp.getMinutes() + 1);
                                    event.gbtt_timestamp.setSeconds(0);
                                }
                            }                        
                            if (event.gbtt_timestamp) memo.push(event);
                        }
                        callback(null, memo);
                    });
                }
            }, function (err, arrivals) {
                arrivals.forEach(function (arrival) {
                    // utils.log(arrival.loc_tiploc + ": arrival of service " + arrival.train_service_code + " at " + prettyPrint(arrival.actual_timestamp) + " rather than " + prettyPrint(arrival.gbtt_timestamp));
                    var trainKey = arrival.loc_tiploc + '_' + arrival.gbtt_timestamp.getTime();
                    if (monitoredTrains[trainKey]) {
                        monitoredTrains[trainKey].callbacks.forEach(function (f) {
                            f({
                                aimedArrivalTime: arrival.gbtt_timestamp,
                                actualArrivalTime: arrival.actual_timestamp,
                            });
                        });   
                        delete monitoredTrains[trainKey];
                    }
                });
            });
        });
    });
}

var prettyPrint = function (d) {
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ":" + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();                   
};

var TrainMonitor = function (fromStationCode, toStationCode, aimedDepartureTime, callback) {
    initialise(function () {
        utils.log("Looking for schedule for train from " + fromStationCode + " to " + toStationCode + " at " + prettyPrint(aimedDepartureTime) + "...");
        scheduleReader.getSchedule(fromStationCode, toStationCode, { 'dateTime': aimedDepartureTime }, function (err, result) { 
            var result = result[0],
                trainKey = toStationCode + '_' + _.last(result.stops).arrival.getTime();
            utils.log("Identified schedule for train from " + fromStationCode + " at " + prettyPrint(result.stops.filter(function (s) { return s.tiploc_code === fromStationCode; })[0].departure) + " to " + toStationCode + " due at " + prettyPrint(_.last(result.stops).arrival) + ", service " + result.service + ".");
            if (!monitoredTrains[trainKey]) monitoredTrains[trainKey] = {
                callbacks: [ ],
            };
            monitoredTrains[trainKey].callbacks.push(callback);
        });
    });
    return { };
};

exports.create = function (fromStationCode, toStationCode, aimedDepartureTime, callback) {
    return new TrainMonitor(fromStationCode, toStationCode, aimedDepartureTime, callback);
};

