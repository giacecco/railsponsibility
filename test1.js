var scheduleReader = new require('./scheduleReader')({ 'couchDb': 'http://localhost:5984' });

scheduleReader.getSchedule('HROW', 'EUSTON', new Date(), function (err, results) {
	console.log(JSON.stringify(results));
});