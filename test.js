var euston = new require('./arrivalsMonitor')('EUS');

euston.getArrivals(function (err, results) {
	console.log(JSON.stringify(results));
});