var fs = require('fs'),
	transportapi = require('./transportapi_interface'),
	_ = require('underscore');


transportapi.getScheduledDepartures('BKM', 'EUS', new Date(), function (err, results) {
	var result = _.first(results);
	console.log("Next train BKM to EUS is " + JSON.stringify(result));
	transportapi.getScheduledService(result.service, 'BKM', result.aimed_departure_time, function (err, results) {
		console.log(JSON.stringify(results));
	});
});

/*
transportapi.getLiveArrivals('EUS', function (err, results) {
	console.log(JSON.stringify(results));
});
*/