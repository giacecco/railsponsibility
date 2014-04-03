var argv = require("optimist")
		.usage("Usage: $0 --out <output data folder if not the script's location>")
		.demand([ 'out' ])
		.alias('out', 'o')
		.argv,
	fs = require('fs'),
	transportapi = require('./transportapi_interface'),
	_ = require('underscore');

var arrivalMonitors = { };

var dateToCSVDate = function (d) {
	return d.getFullYear() + "/" + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + "/" + (d.getDate() < 10 ? '0' : '') + d.getDate() + " " + (d.getHours() < 10 ? '0' : '') + d.getHours() + ":" + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() + ":" + (d.getSeconds() < 10 ? '0' : '') + d.getSeconds();
}

var log = function (s) {
	console.log(dateToCSVDate(new Date()) + " - " + s);
}

function manageArrival (stationCode, arrival) {
	var trainMonitorKey = arrival.destination_code + '_' + arrival.service + '_' + arrival.aimed_arrival_time.valueOf();
	log(stationCode + ': arrival of ' + trainMonitorKey);
	// remove the train from the monitors
	_.each(_.keys(arrivalMonitors), function (stationCode) {
		if (_.contains(arrivalMonitors[stationCode].trains, trainMonitorKey)) {
			log(stationCode + ': removing monitoring of train ' + trainMonitorKey);
			arrivalMonitors[stationCode].trains = _.without(arrivalMonitors[stationCode].trains, trainMonitorKey);
			if (arrivalMonitors[stationCode].trains.length === 0) {
				log(stationCode + ": deleting monitor");
				arrivalMonitors[stationCode].monitor.shutdown();
				delete arrivalMonitors[stationCode];
			}
		}
	});
}

// gets the list of calling stations from fromStationCode to destination for the
// first service calling at fromStationCode on or after dateTime
function getNextStops (fromStationCode, toStationCode, dateTime, callback) {
	transportapi.getScheduledDepartures(fromStationCode, toStationCode, dateTime, function (err, results) {
		if (err) {
			callback(err, [ ]);
		} else {
			var result = _.first(results);
			transportapi.getScheduledService(result.service, fromStationCode, result.aimed_departure_time, function (err, stops) {
				if (err) {
					callback(err, [ ]);
				} else {
					while (_.first(stops).station_code !== fromStationCode) {
						stops = _.rest(stops);
					}
					callback(null, { service: result.service, stops: stops });
				}				
			});
		}
	});
}

function declareDelay (fromStationCode, toStationCode, dateTime, callback) {
	getNextStops(fromStationCode, toStationCode, dateTime, function (err, result) {
		var trainMonitorKey = _.last(result.stops).station_code + '_' + result.service + '_' + _.last(result.stops).aimed_arrival_time.valueOf();
		_.each(result.stops, function (stop) {
			if (!arrivalMonitors[stop.station_code]) {
				// the stop was not being monitored
				log(stop.station_code + ": creating monitor");
				arrivalMonitors[stop.station_code] = { 
					monitor: new require('./arrivalsMonitor')(stop.station_code, argv.out), 
					trains: [ ],
				};
				arrivalMonitors[stop.station_code].monitor.onArrival(function (train) {
					manageArrival(stop.station_code, train);
				});
			}
			// I add the train
			log(stop.station_code + ": adding monitoring of train " + trainMonitorKey);
			if (!_.contains(arrivalMonitors[stop.station_code].trains, trainMonitorKey)) arrivalMonitors[stop.station_code].trains.push(trainMonitorKey);
		});
		callback(null);
	});
}

declareDelay('BKM', 'EUS', new Date(), function (err) {

});