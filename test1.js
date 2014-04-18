var scheduleReader = new require('./scheduleReader')({ 'couchDb': 'http://localhost:5984' });

scheduleReader.getScheduleByCrs('HRW', 'EUS', new Date(), function (err, results) {
	console.log(JSON.stringify(results));
});