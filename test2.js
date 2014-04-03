var argv = require("optimist")
		.usage("Usage: $0 --out <output data folder if not the script's location>")
		.demand([ 'out' ])
		.alias('out', 'o')
		.argv,
	fs = require('fs'),
	transportapi = require('./transportapi_interface'),
	_ = require('underscore');

var monitors = { };

var dateToCSVDate = function (d) {
	return d.getFullYear() + "/" + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + "/" + (d.getDate() < 10 ? '0' : '') + d.getDate() + " " + (d.getHours() < 10 ? '0' : '') + d.getHours() + ":" + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() + ":" + (d.getSeconds() < 10 ? '0' : '') + d.getSeconds();
}

var log = function (s) {
	console.log(dateToCSVDate(new Date()) + " - " + s);
}

// gets the list of calling stations from fromStationCode to destination for the
// first service calling at fromStationCode on or after dateTime
function getNextStops (fromStationCode, toStationCode, dateTime, callback) {
	transportapi.getScheduledDepartures(fromStationCode, toStationCode, dateTime, function (err, results) {
		if (err) {
			callback(err, [ ]);
		} else {
			var result = _.first(results);
			transportapi.getScheduledService(result.service, fromStationCode, result.aimed_departure_time, function (err, results) {
				if (err) {
					callback(err, [ ]);
				} else {
					while (_.first(results).station_code !== fromStationCode) {
						results = _.rest(results);
					}
					callback(null, results);
				}				
			});
		}
	});
}

function declareDelay (fromStationCode, toStationCode, dateTime, callback) {
	getNextStops(fromStationCode, toStationCode, dateTime, function (err, stops) {
		_.each(stops, function (stop) {
			log("Adding " + stop.station_code + " to the pool of monitors...");
			monitors[stop.station_code] = new require('./arrivalsMonitor')(stop.station_code, argv.out);	
		});
		callback(null);
	});
}

declareDelay('BKM', 'EUS', new Date(), function (err) {
	
});