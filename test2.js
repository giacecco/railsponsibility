var fs = require('fs'),
	transportapi = require('./transportapi_interface');

transportapi.getScheduledDepartures('BKM', 'EUS', new Date(), function (err, results) {
	console.log(JSON.stringify(results.departures.all[0]));
	transportapi.getScheduledService(
		results.departures.all[0].service, 
		results.departures.all[0].origin_name, 
		'2014-03-31',
		results.departures.all[0].aimed_departure_time, 
		function (err, results) {
			console.log(JSON.stringify(results));
		});
});