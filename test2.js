var fs = require('fs'),
	transportapi = require('./transportapi_interface'),
	_ = require('underscore');

transportapi.getScheduledDepartures('BKM', 'EUS', new Date(), function (err, results) {
	var result = _.last(results.departures.all);
	console.log(JSON.stringify(result));
	var dateTime = new Date();
	transportapi.getScheduledService(
		result.service, 
		"BKM",
		dateTime.getFullYear() + "-" + (dateTime.getMonth() < 9 ? '0' : '') + (dateTime.getMonth() + 1) + "-" + (dateTime.getDate() < 10 ? '0' : '') + dateTime.getDate(),
		result.aimed_departure_time, 
		function (err, results) {
			console.log(JSON.stringify(results));
	});
});