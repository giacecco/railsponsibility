var trainMonitors = require('./trainMonitors'),
	log = require('./utils').log,
	_ = require('underscore');

var foo = trainMonitors.create("HRW", "EUS", new Date("2014-04-09 21:57"), function (trainInfo) {
	log("The train has arrived, the full train info is " + JSON.stringify(trainInfo));
});
