var trainMonitors = require('./trainMonitors'),
	log = require('./utils').log,
	_ = require('underscore');

var foo = trainMonitors.create("HRW", "EUS", new Date("2014-04-10 18:54"), function (trainInfo) {
	log("The train has arrived, the full train info is " + JSON.stringify(trainInfo));
});
