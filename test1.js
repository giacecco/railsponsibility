var argv = require("optimist")
		.usage("Usage: $0 [--out <output data folder if not the script's location>]")
		.alias("out", "o")
		.default("out", __dirname)	
		.argv,
	_ = require('underscore');

var monitors = { };

_.each([ 'EUS' ], function (stationCode) {
	monitors[stationCode] = new require('./arrivalsMonitor')(stationCode, argv.out);	
});