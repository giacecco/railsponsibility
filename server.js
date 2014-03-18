var RAIL_NETWORKS = [
		{ fullName: "London Midland",
	  	  twitterHandle: "@londonmidland" },
		{ fullName: "Fake Midland",
	  	  twitterHandle: "@fakemidland" },
	],
	MONITORED_STATIONS = [ 'EUS' ];

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
    stride = require("./stride"),
    twitter = require("./twitter"),
    stations = null,
    delayRequests = { },
    delayMemory = { };

function findStation (searchString) {
	searchString = searchString.toLowerCase();
	var found = null;
	stations.forEach(function (station) {
		station.synonyms.concat(station.fullName.toLowerCase()).concat(station.code.toLowerCase()).forEach(function (synonym) {
			if (synonym === searchString) {
				found = station.code;
			}
		});
	});
	return found;
}

function delayRequestsInitialise (callback) {
	var check = function () {
		// {"user":"giacecco","networks":["Fake Midland"],"originStation":"EUS","originTime":"2014-03-18T17:05:22.776Z","toStation":"BKM","toTime":"2014-03-18T18:27:22.777Z","createdAt":"2014-03-18T13:12:23.000Z"}
		async.series([
			function (callback) {
				// identify the train if not did it already
				async.each(Object.keys(delayRequests).filter(function (user) {
					return !delayRequests[user].trainUid;
				}), function (user, callback) {
					stride.getDepartures(delayRequests[user].originStation, function (err, results) {
						results = results.departures.all.filter(function (arrival) {
							return arrival.expected_departure_time === (delayRequests[user].originTime.getHours() < 10 ? '0' : '') + delayRequests[user].originTime.getHours() + ":" + (delayRequests[user].originTime.getMinutes() < 10 ? '0' : '') + delayRequests[user].originTime.getMinutes();
						});
						if (results.length > 0) {
							delayRequests[user].trainUid = results[0].train_uid;
						} else {
							console.log("*** Error, train departure not found");
						}
						callback(null);
					});
				});
			},
			function (callback) {
				// if the train has arrived, tell them
				async.each(Object.keys(delayRequests).filter(function (user) {
					return delayRequests[user].trainUid;
				}), function (user, callback) {
					if (delayMemory[trainUid]) {
						if (delayMemory[trainUid].status === "arrived") {
							twitter.send("@" + user + " your train has arrived with a delay of " + parseInt(Math.floor((delayMemory.stationCode[arrival["train_uid"]].expectedArrivalTime - delayMemory.stationCode[arrival["train_uid"]].aimedArrivalTime) / 60000)) + " minutes", function (err) {
								delete delayRequests[user];
							});
						}
					}
				});
			}
		]);
	};
	check(); setInterval(check, 60000);
	if (callback) callback(null);
}

function delayMemoryInitialise (callback) {
	// TODO: garbage collection
	var check = function () {
		async.each(MONITORED_STATIONS, function (stationCode, callback) {
			if (!delayMemory.stationCode) delayMemory.stationCode = { };
			stride.getArrivals(stationCode, function (err, results) {

				// checking which trains have arrived
				Object.keys(delayMemory.stationCode)
					.filter(function (trainUid) { return delayMemory.stationCode[trainUid].status === "live"; })
					.forEach(function (trainUid) {
						var liveTrains = results.arrivals.all.map(function (arrival) { return arrival["train_uid"]; });
						if (liveTrains.indexOf(trainUid) === -1) {
							delayMemory.stationCode[trainUid].status = "arrived";
							console.log("*** Delayed train " + trainUid + " has arrived.");
						}
					});

				// updating live trains
				results.arrivals.all.filter(function (arrival) {
	    			return (arrival.status === "LATE") && (arrival["aimed_arrival_time"] !== arrival["expected_arrival_time"]);
	    		}).forEach(function (arrival) {
	    			var entryDate = new Date();
	    			delayMemory.stationCode[arrival["train_uid"]] = { 
	    				status: "live",
	    				time: results["request_time"],
	    				originStation: findStation(arrival["origin_name"]),
	    				toStation: findStation(arrival["destination_name"]),
						aimedArrivalTime: new Date(entryDate.getFullYear() + "/" + (entryDate.getMonth() < 9 ? '0' : '') + (entryDate.getMonth() + 1) + "/" + (entryDate.getDate() < 10 ? '0' : '') + entryDate.getDate() + " " + arrival["aimed_arrival_time"]),
						expectedArrivalTime: new Date(entryDate.getFullYear() + "/" + (entryDate.getMonth() < 9 ? '0' : '') + (entryDate.getMonth() + 1) + "/" + (entryDate.getDate() < 10 ? '0' : '') + entryDate.getDate() + " " + arrival["expected_arrival_time"]),
	    				arrivalRecord: arrival
	    			};		
	    			console.log("*** Updating delayed train " + arrival["train_uid"] +  " from " + delayMemory.stationCode[arrival["train_uid"]].originStation + " to " + delayMemory.stationCode[arrival["train_uid"]].toStation + " with ETA " + arrival["expected_arrival_time"] + " (" + parseInt(Math.floor((delayMemory.stationCode[arrival["train_uid"]].expectedArrivalTime - delayMemory.stationCode[arrival["train_uid"]].aimedArrivalTime) / 60000)) + ")");
	    		});

				callback(err);
			});
		}, function (err) { });
	}
	check(); setInterval(check, 60000);
	if (callback) callback(null);
};

function startSearch (err) {
    twitter.listen(function (err, tweet) {
		// @railspon [network twitter handle] from [station] [time] to [station] [time]
		// @railspon @fakemidland from euston 1424 to berko 1827 #justtesting
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
		temp.setSeconds(0);
		delayData.originTime = temp;

		delayData.toTime = tweet.message.split(delayData.toStation)[1].replace(/^\s\s*/, '').replace(/\s\s*$/, '').split(" ")[0].replace(/^\s\s*/, '').replace(/\s\s*$/, '');
		temp = new Date();
		temp.setHours(Math.floor(delayData.toTime / 100));
		temp.setMinutes(delayData.toTime - Math.floor(delayData.toTime / 100) * 100);
		temp.setSeconds(0);
		delayData.toTime = temp;

		if (findStation(delayData.originStation)) delayData.originStation = findStation(delayData.originStation);
		if (findStation(delayData.toStation)) delayData.toStation = findStation(delayData.toStation);

		console.log("*** Received tweet: " + JSON.stringify(delayData));
    	delayRequests[delayData.user] = delayData;
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
	function (callback) { stride.getStations(function (err, s) { stations = s; callback(null); }); },
    twitter.initialise,
    delayMemoryInitialise,
    delayRequestsInitialise
], function (err) {
	if (!err) {
		// all operations
		async.parallel([
			startSearch,
			launchWebServer
		]);
	}
});
