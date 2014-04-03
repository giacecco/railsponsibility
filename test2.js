var fs = require('fs'),
	transportapi = require('./transportapi_interface'),
	_ = require('underscore');

function foo (fromStationCode, toStationCode, aimedDepartureTime, callback) {
	transportapi.getScheduledDepartures(fromStationCode, toStationCode, new Date(), function (err, results) {
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

foo('BKM', 'EUS', new Date(), function (err, results) {
	console.log(JSON.stringify(results));
});