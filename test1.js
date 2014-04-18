var scheduleReader = new require('./scheduleReader')({ 'couchDb': 'http://localhost:5984' }),
	twitter = new require('./twitter');

/*
scheduleReader.getScheduleByCrs('HRW', 'EUS', new Date(), function (err, results) {
	console.log(JSON.stringify(results));
});
*/
twitter.updateStatus("This is a test", function (err) { 
	console.log(err);
});