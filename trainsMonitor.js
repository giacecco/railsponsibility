var ARRIVAL_MISALIGNMENT_TOLERANCE = 5; //minutes

var async = require('async'),
    Stomp = require('stomp-client'), // https://github.com/easternbloc/node-stomp-client
    utils = require('./utils'),
	_ = require('underscore');

module.exports = function (options) { 

    var codesReader = new require('./codesReader')(options),
        db = null,
        scheduleReader = new require('./scheduleReader')(options),
        listener = new Stomp('datafeeds.networkrail.co.uk', 61618, process.env.NROD_USERNAME, process.env.NROD_PASSWORD),
        listenerIsOn = false,
        monitoredTrains = { },
        nano = require('nano')(options.couchdb);

    var startListener = function (callback) {
        if (listenerIsOn) { 
            utils.log("trainsMonitor: The listener is already connected.");
            if (callback) callback(null); 
        } else {
            utils.log("trainsMonitor: Connecting listener...");
            listener.connect(
                // success callback
                function (sessionId) { 
                    utils.log("trainsMonitor: Listener connection successful.");
                    listenerIsOn = true; 
                    listener.subscribe('/topic/TRAIN_MVT_ALL_TOC', processIncomingEvents); 
                    if (callback) callback(null);
                },
                // error callback
                // TODO: perhaps I could make this more resilient rather than just exiting
                function (err) { throw err; }
            );
        }
    }

    var stopListener = function (callback) {
        if (!listenerIsOn) { 
            utils.log("trainsMonitor: The listener is already disconnected.");
            if (callback) callback(null); 
        } else {
            utils.log("trainsMonitor: Disconnecting listener...");
            listener.disconnect(function (err) { 
                // TODO: perhaps I could make this more resilient rather than just exiting
                if (err) throw err;
                utils.log("trainsMonitor: Listener disconnection successful.");
                listenerIsOn = false; 
                if (callback) callback(null); 
            });
        }
    };

    var processIncomingEvents = function (events, headers) {
        events = async.reduce(JSON.parse(events), [ ], function (memo, event, callback) { 
            if (!event.body.loc_stanox || (event.body.event_type !== 'ARRIVAL')) {
                callback(null, memo);
            } else {
                codesReader.stanox2tiploc(event.body.loc_stanox, function (err, tiploc) {
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
                // TODO: the feature below needs being done properly
                // I archive info for all delayed arrivals, even if I 
                // don't monitor them
                // if (arrival.variation_status === 'LATE') { db.insert(arrival); }
                var trainKey = function () {
                    var trainKey = null;
                // *** DEBUG ONLY
                    if (process.env.DEBUG === 'true') utils.log('*** arrival at ' + arrival.loc_tiploc.toUpperCase() + ' at ' + arrival.gbtt_timestamp + "(" + arrival.gbtt_timestamp.getTime() + ")");
                    [ 0 ].concat(_.range(-ARRIVAL_MISALIGNMENT_TOLERANCE, 0)).concat(_.range(1, ARRIVAL_MISALIGNMENT_TOLERANCE + 1)).forEach(function (misalignment) {
                        if (!trainKey) {
                            var tempTrainKey = arrival.loc_tiploc.toUpperCase() + '_' + arrival.train_service_code + '_' + (arrival.gbtt_timestamp.getTime() + misalignment * 60000);
                        // *** DEBUG ONLY
                            if ((process.env.DEBUG === 'true') && (arrival.loc_tiploc.toUpperCase() === 'EUSTON')) utils.log("    testing " + tempTrainKey + " vs " + _.keys(monitoredTrains));                                    
                            if (monitoredTrains[tempTrainKey]) trainKey = tempTrainKey;
                        }
                    });
                    return trainKey;
                }(); 
                if (trainKey) {
                    utils.log("trainsMonitor: Arrival of monitored train " + trainKey + ".");
                    monitoredTrains[trainKey]({
                        aimedArrivalTime: arrival.gbtt_timestamp,
                        actualArrivalTime: arrival.actual_timestamp,
                    });
                    delete monitoredTrains[trainKey];
                    if (_.keys(monitoredTrains).length === 0) stopListener();
                }
            });
        });
    }

    var prettyPrint = function (d) {
        return (d.getHours() < 10 ? '0' : '') + d.getHours() + ":" + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();                   
    };

    var TrainMonitor = function (fromStationCrs, toStationCrs, aimedDepartureTime, onArrivalCallback) {
        startListener(function (err) {
            var fromStationTiplocs,
                toStationTiplocs;
            async.parallel([
                function (callback) { codesReader.crs2tiploc(fromStationCrs, function (err, tiplocs) {
                    fromStationTiplocs = tiplocs;
                    callback(err);
                }) },
                function (callback) { codesReader.crs2tiploc(toStationCrs, function (err, tiplocs) {
                    toStationTiplocs = tiplocs;
                    callback(err);
                }) },
            ], function (err) {
                utils.log("trainsMonitor: Looking for schedule for train from " + fromStationCrs + " to " + toStationCrs + " at " + prettyPrint(aimedDepartureTime) + "...");
                scheduleReader.getScheduleByTiplocs(fromStationTiplocs, toStationTiplocs, { 'dateTime': aimedDepartureTime }, function (err, result) { 
                    result = result[0];
                    var fromStationTiploc = _.intersection(fromStationTiplocs, result.stops.map(function (s) { return s.tiploc_code; }))[0],
                        toStationTiploc = _.intersection(toStationTiplocs, result.stops.map(function (s) { return s.tiploc_code; }))[0],
                        trainKey = toStationTiploc + '_' + result.service + '_' + _.last(result.stops).arrival.getTime();
                    utils.log("trainsMonitor: Identified schedule for train from " + fromStationCrs + " at " + prettyPrint(result.stops.filter(function (s) { return fromStationTiploc === s.tiploc_code; })[0].departure) + " to " + toStationCrs + " due at " + prettyPrint(result.stops.filter(function (s) { return toStationTiploc === s.tiploc_code; })[0].arrival) + ", service " + result.service + ".");
                    monitoredTrains[trainKey] = onArrivalCallback;
                });
            });
        });
        return { };
    };

    var create = function (fromStationCrs, toStationCrs, aimedDepartureTime, onArrivalCallback) {
        return new TrainMonitor(fromStationCrs, toStationCrs, aimedDepartureTime, onArrivalCallback);
    };

    // I create the delayed arrivals database
    nano.db.get('delayed_arrivals_archive', function (err, body) {
        if (err) {
            // if I get an error here it is likely because the database does
            // not exist
            nano.db.create('delayed_arrivals_archive', function(err) { 
                db = nano.use('delayed_arrivals_archive');
            });
        } else {
            db = nano.use('delayed_arrivals_archive');
        }
    });
    return {
        'create': create,
    };

}

