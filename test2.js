var fs = require('fs'),
	transportapi = require('./transportapi_interface'),
	_ = require('underscore');

/*
transportapi.getScheduledDepartures('BKM', 'EUS', new Date(), function (err, results) {
	var result = _.last(results.departures.all);
	console.log(JSON.stringify(result));
	var dateTime = new Date();
});
*/

transportapi.getLiveArrivals('EUS', function (err, results) {
	console.log(JSON.stringify(results));
});