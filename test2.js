var fs = require('fs'),
	transportapi = require('./transportapi_interface'),
	_ = require('underscore');

var monitors = { };

// gets the list of calling stations from fromStationCode to destination for the
// first service calling at fromStationCode on or after dateTime
function getCallingStations (fromStationCode, toStationCode, dateTime, callback) {
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
	getCallingStations(fromStationCode, toStationCode, dateTime, function (err, call) {


	});
}

getCallingStations('BKM', 'EUS', new Date(), function (err, results) {
	console.log(JSON.stringify(results));
});