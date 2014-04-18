var scheduleReader = new require('./scheduleReader')({ 'couchDb': 'http://localhost:5984' }),
	utils = new require('./utils')({ 'couchDb': 'http://localhost:5984' });

scheduleReader.getScheduleByCrs('HRW', 'EUS', new Date(), function (err, results) {
	console.log(JSON.stringify(results));
});

/*
utils.log("Initialisation...");
utils.crs2tiploc('HRW', function (err, results) {
	utils.log(results);
	utils.log(results);
});
*/