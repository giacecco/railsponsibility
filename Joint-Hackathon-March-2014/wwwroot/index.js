function initialise() {
	d3.csv("/data/", function (err, data) {
		d3.select("body").selectAll("p")
			.data(data)
			.enter()
			.append("p")
			.text(function (d) {
				return "@" + d.user + " from " + d.originStation + " at " + d.originTime + " to " + d.toStation + " at " + d.toTime;
			});		
	});
}

function update() {
	console.log("I am here");
	d3.csv("/data/", function (err, data) {
		d3.select("body").selectAll("p").data(data);
	});
}