var argv = require("optimist")
		.usage("Usage: $0 --out <output data folder if not the script's location>")
		.demand([ 'out' ])
		.alias('out', 'o')
		.argv,
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

var trainsMonitor = require('./trainsMonitor')(argv.out);
trainsMonitor.add('BSH', 'EUS', new Date(), function (err) { });	
