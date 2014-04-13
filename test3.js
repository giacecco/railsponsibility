var fs = require('fs'),
	scheduleReader = require('./NROD_scheduleReader'),
	trainMonitor = require('./NROD_trainsMonitor');

/*
trainMonitor.create('HROW', 'EUSTON', new Date(), function (trainInfo) {
	console.log("The train has arrived: " + JSON.stringify(trainInfo));
});
*/
scheduleReader.getSchedule([ 'HROW', 'HROWDC' ], 'EUSTON', { 'dateTime': new Date() }, function (err, results) {
	fs.writeFileSync('foo.json', JSON.stringify(results));
	console.log('Done');
});