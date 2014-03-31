var test = new require("./transportapi_interface").arrivalsMonitor('EUS');

test.getArrivals(function (err, results) {
	console.log(results);
});