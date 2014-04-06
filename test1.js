var argv = require("optimist")
		.usage("Usage: $0 --out <output data folder if not the script's location>")
		.demand([ 'out' ])
		.alias('out', 'o')
		.argv,
	TrainMonitor = require('./trainMonitor'),
	_ = require('underscore');

var manageArrival = function (from, to, aimedDepartureTime) {
	console.log("*** arrived " + aimedDepartureTime + " from " + from + " to " + to + ".");
}

function addMonitor (from, to, aimedDepartureTime) {
	var trainMonitor = new TrainMonitor(from, to, aimedDepartureTime, {
		'dataFolder': argv.out,
		'arrivalCallback': _.bind(manageArrival, { }, from, to, aimedDepartureTime),
	});
}

addMonitor('HRW', 'EUS', new Date('2014-04-06 23:07'));
addMonitor('HRW', 'EUS', new Date('2014-04-06 23:29'));