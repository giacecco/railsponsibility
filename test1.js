var argv = require("optimist")
		.usage("Usage: $0 --out <output data folder if not the script's location>")
		.demand([ 'out' ])
		.alias('out', 'o')
		.argv,
	transportapi = require('./transportapi_interface'),
	_ = require('underscore');

/*
var monitors = { };
_.each([ 'EUS' ], function (stationCode) {
	monitors[stationCode] = new require('./arrivalsMonitor')(stationCode, argv.out);	
	monitors[stationCode].onArrival(function (stationCode, train) {
		console.log(stationCode + ": arrival of " + JSON.stringify(train));
	})
});
*/

/*
var trainsMonitor = require('./trainsMonitor')(argv.out);
trainsMonitor.add('BSH', 'EUS', new Date(), function (err) { });	
*/

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

function manageArrival (stationCode, trainInfo) {
	console.log('*** ', stationCode, JSON.stringify(trainInfo));
} 

getNextStops('HRW', 'EUS', new Date("2014-04-06 14:17"), function (err, result) {
	var arrivalsMonitor = new require('./arrivalsMonitor')('EUS', {
		'dataFolder': argv.out,
		'arrivalCallback': _.bind(manageArrival, { }, 'EUS'),
		'limitTo': [ { 'service': result.service, 'aimedArrivalTime': _.last(result.stops).aimed_arrival_time } ],
	});
});
