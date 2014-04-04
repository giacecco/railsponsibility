var dateToCSVDate = require('./utils').dateToCSVDate,
	fs = require('fs'),
	log = require('./utils').log,
	transportapi = require('./transportapi_interface'),
	_ = require('underscore');

var ADVANCE_MONITOR_CREATION = 5; // minutes

module.exports = function (dataFolder) {

	var _dataFolder,
		arrivalMonitors = { };

	// this is being called when the train arrival described in 'arrival' arrives at 
	// stationCode
	var manageArrival = function (stationCode, arrival) {
		var trainMonitorKey = arrival.destination_code + '_' + arrival.service + '_' + arrival.aimed_arrival_time.valueOf();
		if (_.contains((arrivalMonitors[stationCode] || { trains: [ ] }).trains, trainMonitorKey)) {
			// if the train was being monitored for the arriving station...
			log(stationCode + ': arrival of ' + trainMonitorKey);
			// remove the train from the monitor
			arrivalMonitors[stationCode].trains = _.without(arrivalMonitors[stationCode].trains, trainMonitorKey);
			// if the monitor has no trains, remove the monitor, too
			if (arrivalMonitors[stationCode].trains.length === 0) {
				log(stationCode + ": deleting monitor");
				arrivalMonitors[stationCode].monitor.shutdown();
				delete arrivalMonitors[stationCode];
			}
		}
	}

	// gets the list of calling stations from fromStationCode to destination for the
	// first service calling at fromStationCode on or after dateTime
	var getNextStops = function (fromStationCode, toStationCode, dateTime, callback) {
		transportapi.getScheduledDepartures(fromStationCode, toStationCode, dateTime, function (err, results) {
			if (err) {
				callback(err, [ ]);
			} else {
				var result = _.first(results);
				transportapi.getScheduledService(result.service, fromStationCode, result.aimed_departure_time, function (err, stops) {
					if (err) {
						callback(err, [ ]);
					} else {
						while ((_.first(stops).station_code !== fromStationCode) ||
							   (_.first(stops).aimed_arrival_time < dateTime)) {
							stops = _.rest(stops);
						}
						callback(null, { service: result.service, stops: stops });
					}				
				});
			}
		});
	}

	var add = function (fromStationCode, toStationCode, dateTime, callback) {

		function addTrainToMonitor (stationCode, trainMonitorKey) {
			if (!arrivalMonitors[stationCode]) {
				// the stop was not being monitored
				log(stationCode + ": creating monitor");
				arrivalMonitors[stationCode] = { 
					monitor: new require('./arrivalsMonitor')(stationCode, _dataFolder), 
					trains: [ ],
				};
				arrivalMonitors[stationCode].monitor.onArrival(manageArrival);
			}
			// I add the train
			log(stationCode + ": adding monitoring of train " + trainMonitorKey);
			if (!_.contains(arrivalMonitors[stationCode].trains, trainMonitorKey)) arrivalMonitors[stationCode].trains.push(trainMonitorKey);
		}

		getNextStops(fromStationCode, toStationCode, dateTime, function (err, result) {
			var trainMonitorKey = _.last(result.stops).station_code + '_' + result.service + '_' + _.last(result.stops).aimed_arrival_time.valueOf();
			_.each(result.stops, function (stop) {
				// I delay the creation of the monitor for intermediate stops, but
				// create immediately the monitor for the destination
				setTimeout(function () { addTrainToMonitor(stop.station_code, trainMonitorKey) }, (stop.station_code !== _.last(result.stops).station_code) ? Math.max(0, stop.aimed_arrival_time - ADVANCE_MONITOR_CREATION * 60000 - (new Date())) : 0);
			});
			callback(null);
		});
	}

	_dataFolder = dataFolder;
	return {
		add: add,
	}

}