var DEFAULT_POLL_FREQUENCY = 1, // minutes
	ADVANCE_MONITOR_AWAKENING = 1; // minutes

var fs = require('fs'),
	log = require('./utils').log,
	transportapi = require('./transportapi_interface'),
	_ = require('underscore');

// returns service number and aimed arrival time at toStationCode of the first
// train leaving from fromStationCode on or after dateTime 
var getTrainDetails = function (fromStationCode, toStationCode, dateTime, callback) {
	transportapi.getScheduledDepartures(fromStationCode, toStationCode, dateTime, function (err, results) {
		if (err) throw err;
		transportapi.getScheduledService(_.first(results).service, fromStationCode, _.first(results).aimed_departure_time, function (err, stops) {
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
			aimedArrivalTime = result.aimedArrivalTime;
			log("Identified train as service " + service + " from " + fromStationCode + " at " + result.aimedDepartureTime + " due to arrive at " + toStationCode + " at " + aimedArrivalTime);
			cycle();
		});
	}

	var cycle = function () {
		var arrivalCache = null,
			dateStart = new Date();
		transportapi.getLiveArrivals(toStationCode, function (err, arrival) {
			fs.writeFileSync("foo.json", JSON.stringify(arrival));
			arrival = _.filter(arrival, function (a) {
				return (a.service === service) && (a.aimed_arrival_time.getTime() === aimedArrivalTime.getTime());
			})[0];
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