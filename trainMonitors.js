var DEFAULT_POLL_FREQUENCY = 1, // minutes
	ADVANCE_MONITOR_AWAKENING = 1; // minutes

var fs = require('fs'),
	log = require('./utils').log,
	transportapi = require('./transportapi_interface'),
	_ = require('underscore');

// returns service number and aimed arrival time at toStationCode of the first
// train leaving from fromStationCode on or after dateTime 
var getTrainDetails = function (fromStationCode, toStationCode, dateTime, callback) {
	log("Calling getScheduledDepartures...");
	transportapi.getScheduledDepartures(fromStationCode, toStationCode, dateTime, function (err, results) {
		if (err) throw err;
		console.log(results);
		log("Calling getScheduledService...");
		transportapi.getScheduledService(_.first(results).service, fromStationCode, _.first(results).aimed_departure_time, function (err, stops) {
			log("Finished calling");
			if (err) throw err;
			stops = _.filter(stops, function (s) { return s.station_code === toStationCode; });
			callback(null, { 
				service: results[0].service, 
				aimedDepartureTime: results[0].aimed_departure_time,
				aimedArrivalTime: stops[0].aimed_arrival_time, 
			});
		});
	});
};

var TrainMonitor = function (fromStationCode, toStationCode, aimedDepartureTime, callback) {

	var status = 'UNKNOWN', // UNKNOWN -> ARRIVING -> ARRIVED
		aimedArrivalTime = null,
		service = null;

	var initialise = function () {
		log("Searching for train from " + fromStationCode + " at " + aimedDepartureTime + " to " + toStationCode + "...");
		getTrainDetails(fromStationCode, toStationCode, aimedDepartureTime, function (err, result) {
			if (err) throw err;
			service = result.service;
			aimedArrivalTime = new Date(result.aimedArrivalTime.getTime());
			log("Identified train as service " + service + " from " + fromStationCode + " at " + result.aimedDepartureTime + " due to arrive at " + toStationCode + " at " + aimedArrivalTime);
			cycle();
		});
	}

	var cycle = function () {
		var arrivalCache = null,
			dateStart = new Date();
		transportapi.getLiveArrivals(toStationCode, function (err, arrivals) {
			fs.writeFileSync("foo.json", JSON.stringify(arrivals));
			// I pick only the live arrivals of the service I am interested in
			arrival = _.filter(arrivals, function (a) { 
				if (a.service === service) { console.log(a.aimed_arrival_time.getTime() + ' vs ' + aimedArrivalTime.getTime() + ' ' + (a.aimed_arrival_time.getTime() === aimedArrivalTime.getTime() ? "FOUND" : "")); }
				return (a.service === service) && (a.aimed_arrival_time.getTime() === aimedArrivalTime.getTime()); 
			})[0]; 
/*
			// BEGIN OF WORKAROUND TO ISSUE #7
			// I check if there is at least one train of the same service 
			// arriving at the expected time or earlier, and another arriving
			// at the same time or later, in which case I change the 
			// aimedArrivalTime to match the closest
			if (!arrival) {
				if (_.some(arrivals, function (a) {
					return a.aimed_arrival_time.getTime() <= aimedArrivalTime.getTime();
				}) && _.some(arrivals, function (a) { 
					return a.aimed_arrival_time.getTime() >= aimedArrivalTime.getTime();
				})) {
					// ... and I get the one with the time that is closest to 
					// what I was expecting
					arrival = arrivals.sort(function (a, b) { 
						return Math.abs(a.aimed_arrival_time - aimedArrivalTime) - Math.abs(b.aimed_arrival_time - aimedArrivalTime);
					})[0];
					log(toStationCode + ": correcting service " + service + "'s aimed arrival time of " + aimedArrivalTime + " with " + arrival.aimed_arrival_time);
					aimedArrivalTime = new Date(arrival.aimed_arrival_time.getTime());
				}
			}
			// END OF WORKAROUND TO ISSUE #7
*/
			var oneMinuteFromNow = new Date(dateStart.getTime());
			oneMinuteFromNow.setMinutes(oneMinuteFromNow.getMinutes() + 1);
			var checkAgainAt = new Date(Math.max(oneMinuteFromNow.getTime(), (arrival ? Math.min(arrival.aimed_arrival_time.getTime(), arrival.expected_arrival_time.getTime()) : aimedArrivalTime.getTime()) - ADVANCE_MONITOR_AWAKENING * 60000));
			switch (status) {
				case 'UNKNOWN':
					// I am expecting to see the train being listed among the
					// upcoming arrivals
					if (arrival) {
						status = 'ARRIVING';
						log(toStationCode + ": service " + service + " was listed for arrival.");
					}
					break;
				case 'ARRIVING':
					// I have see the train arriving, now I am waiting for it
					// to disappear to know it has arrived
					if (!arrival) {
						status = 'ARRIVED';
						log(toStationCode + ": service " + service + " has arrived.");
						callback(arrivalCache);
					} else {
						arrivalCache = arrival;
					}
					break;
			};
			if (status !== 'ARRIVED') {
				log(toStationCode + ": checked arrival of service " + service + " from " + fromStationCode + ", next check at " + checkAgainAt + ".");
				setTimeout(cycle, checkAgainAt.getTime() - (new Date()).getTime());
			}
		});
	}

	initialise();
	return { };
};

exports.create = function (fromStationCode, toStationCode, aimedDepartureTime, callback) {
	return new TrainMonitor(fromStationCode, toStationCode, aimedDepartureTime, callback);
};