var fs = require('fs'),
	transportapi = require('./transportapi_interface');

transportapi.getScheduledDepartures('BKM', 'EUS', new Date(), function (err, results) {
	console.log(JSON.stringify(results.departures.all[0]));
	transportapi.getScheduledService(results.departures.all[0].service, function (err, results) {
		console.log(JSON.stringify(results));
	});
});