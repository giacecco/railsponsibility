var RAIL_NETWORKS = [
		{ fullName: "London Midland",
	  	  twitterHandle: "@londonmidland" },
		{ fullName: "Fake Midland",
	  	  twitterHandle: "@fakemidland" },
	],
	STATIONS = [
		{ fullName: "London Euston",
		  synonyms: [ "euston", "londoneuston", "london euston", "eus" ] },
		{ fullName: "Berkhamsted",
		  synonyms: [ "berkhamsted", "berkhampsted", "berko" ] },
	];		

var async = require("async"),
	argv = require("optimist")
		.usage('Usage: $0 --wwwroot <web server root folder> [--port <web server port to dowload csv report>]')
		.demand([ "wwwroot" ])
		// parameters that can be specified on the command line only
		.alias("filename", "f")
		.alias("wwwroot", "w")
		// defaults
		.default("port", 8080)
		.argv,
	csv = require("csv"),	
	fs = require("fs"),
    twitter = require("./twitter"),
    delayRecords = [ ];

function findStation(searchString) {
	var found = null;
	STATIONS.forEach(function (station) {
		station.synonyms.forEach(function (synonym) {
			if (synonym === searchString) found = station.fullName;
		});
	});
	return found;
}

function startSearch (err) {
    twitter.listen(function (err, tweet) {
		// @railspon [network twitter handle] from [station] [time] to [station] [time]
		// @railspon @fakemidland from euston 1705 to berko 1827 #justtesting
		var namedHandles = [ ],
			delayData = { 
				user: null,
				networks: [ ],
				originStation: null,
				originTime: null,
				toStation: null,
				toTime: null,
			}, 
			temp;
		tweet.message = tweet.message.toLowerCase() + " ";
		namedHandles = tweet.message
			.match(/@\w+/g)
			.filter(function (handle) { return handle != "@railspon"; });
		namedHandles.forEach(function (namedNetwork) {
			RAIL_NETWORKS.forEach(function (railNetwork) {
				if (railNetwork.twitterHandle === namedNetwork) {
					delayData.networks.push(railNetwork.fullName);
				}
			});
		});

		delayData.createdAt = tweet.created_at;
		delayData.user = tweet.from.toLowerCase();

		delayData.originStation = tweet.message.split("from ")[1].split(" ")[0];
		delayData.toStation = tweet.message.split("to ")[1].split(" ")[0];

		delayData.originTime = parseInt(tweet.message.split(delayData.originStation)[1].split(" to ")[0].replace(/^\s\s*/, '').replace(/\s\s*$/, ''));
		temp = new Date();
		temp.setHours(Math.floor(delayData.originTime / 100));
		temp.setMinutes(delayData.originTime - Math.floor(delayData.originTime / 100) * 100);
		delayData.originTime = temp;

		delayData.toTime = tweet.message.split(delayData.toStation)[1].replace(/^\s\s*/, '').replace(/\s\s*$/, '').split(" ")[0].replace(/^\s\s*/, '').replace(/\s\s*$/, '');
		temp = new Date();
		temp.setHours(Math.floor(delayData.toTime / 100));
		temp.setMinutes(delayData.toTime - Math.floor(delayData.toTime / 100) * 100);
		delayData.toTime = temp;

		if (findStation(delayData.originStation)) delayData.originStation = findStation(delayData.originStation);
		if (findStation(delayData.toStation)) delayData.toStation = findStation(delayData.toStation);

		console.log("I am here " + JSON.stringify(delayData));
    	delayRecords.push(delayData);
    });
}

function launchWebServer () {
	var express = require("express"),
		app = express(),
		path = require("path");
	app.use(express.static(argv.wwwroot));
	app.get('/data/', function(req, res) {
		if (delayRecords.length > 0) {
			csv()
				.from.array(delayRecords.sort(function (a, b) { return a.createdAt > b.createdAt ? 1 : -1; }))
				.to.string(function (data, count) { 
					res.setHeader('Content-Type', 'text/csv');
					res.setHeader('Content-Length', Buffer.byteLength(data));
					res.end(data);
				}, { header: true,
					 columns: Object.keys(delayRecords[0]) });
		} else {
			res.setHeader('Content-Type', 'text/csv');
			res.setHeader('Content-Length', Buffer.byteLength(""));
			res.end("");
		}
	});
	app.listen(parseInt(argv.port));
	console.log("The web server is listening at http://localhost" + (parseInt(argv.port) !== 80 ? ":" + argv.port : ""));
}

async.series([
	// all initialisation
    twitter.initialise
], function (err) {
	if (!err) {
		// all operations
		async.parallel([
			startSearch,
			launchWebServer
		]);
	}
});
