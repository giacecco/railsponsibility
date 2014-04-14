var fs = require('fs'),
	trainMonitor = require('./NROD_trainsMonitor');

trainMonitor.create('HRW', 'EUS', new Date('2014-04-14 18:57'), function (trainInfo) {
	console.log("The train has arrived: " + JSON.stringify(trainInfo));
});
