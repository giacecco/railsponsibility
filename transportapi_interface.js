/* **************************************************************************
   transportapi_interface.js is a simple Node.js proxy to the Transport API
   apis we are using. It tends not to change the results of the underlying 
   APIs but to address its oddities, e.g. 
   - the way station codes (e.g. EUS) are required as input but station full
     names (e.g. London Euston) are returned in the results
   - actual dates and times, e.g. the arrival of a live train, not being
     provided as JSON dates
   - the "scheduled service" endpoint not supporting JSON as an output
   ************************************************************************** */

var AsyncCache = require('async-cache'),
	async = require('async'),
	csv = require('csv'),
	fs = require('fs'),
	log = require('./utils').log,
	path = require('path'),
	request = require('request'),
	_ = require('underscore'),
	_str = require('underscore.string');
_.mixin(_str.exports());

var SECRET_FILENAME = path.join(__dirname, "TRANSPORTAPI_SECRET.json"),
	SECRET = null;

var initialise = function (callback) {
	if (SECRET) {
		callback(null);
	} else {
		async.parallel([
			// read the 'secret' to call the Transport API
			function (callback) {
				fs.readFile(SECRET_FILENAME, function (err, contents) {
					SECRET = JSON.parse(contents);
					callback(err);
				});
			},
			// loads the RailReferences.csv file
			function (callback) {
				csv()
					.from.path(path.join(__dirname, "RailReferences.csv"), {
						columns: true
					})	
					.to.array(function (stationCodes) {
						STATION_CODES = stationCodes;
						callback(null);
					}, { columns: [ 'CrsCode', 'StationName' ] })
					.transform(function (row) {
						row.StationName = row.StationName.replace(' Rail Station', '');
						return row;
					});
			},
		], function (err) {
			callback(err);
		});
	}
};

var stationCodeFromName = _.memoize(function (name) {
	return _.map(STATION_CODES, function (couple) {
		return { 'CrsCode': couple.CrsCode, 'levenshtein': _.levenshtein(name, couple.StationName) }
	}).sort(function (a, b) { return a.levenshtein - b.levenshtein; })[0].CrsCode;
});

var stationNameFromCode = _.memoize(function (code) {
	code = code.toUpperCase();
	return _.map(STATION_CODES, function (couple) {
		return { 'StationName': couple.StationName, 'levenshtein': _.levenshtein(code, couple.CrsCode) }
	}).sort(function (a, b) { return a.levenshtein - b.levenshtein; })[0].StationName;
});

// Lots of doubts here about the behaviour of Transport API's 'Scheduled 
// Service' endpoint here. At the moment, assuming you know the service, this
// function returns the first train calling at stationCode on or after dateTime
var getScheduledServiceCached = new AsyncCache({
	'max': 1000, // TODO: does this number make sense?
	'load': function (key, callback) {
			initialise(function (err) {
				var service = key.split('_')[0],
					stationCode = key.split('_')[1],
					dateTime = new Date(parseInt(key.split('_')[2])),
					date = dateTime.getFullYear() + "-" + (dateTime.getMonth() < 9 ? '0' : '') + (dateTime.getMonth() + 1) + "-" + (dateTime.getDate() < 10 ? '0' : '') + dateTime.getDate(),
					time = (dateTime.getHours() < 10 ? '0' : '') + dateTime.getHours() + ":" + (dateTime.getMinutes() < 10 ? '0' : '') + dateTime.getMinutes();
				request.get(
					'http://transportapi.com/v3/uk/train/service/' + service + '/' + date + '/' + time + '/timetable.json',
					{
						'qs': {
							'api_key': SECRET.api_key,
							'app_id': SECRET.application_id,
							'stationcode': stationCode,
						},
						'json': true,
					},
					function (err, response, results) {
						results = results.stops || [ ];
						_.each(results, function (stop) {
							// TODO: the line below should not be necessary, see 
							// issue #6 https://github.com/Digital-Contraptions-Imaginarium/railsponsibility/issues/6
							stop.station_code = stationCodeFromName(stop.station_name);
							_.each([ 'aimed_arrival_time', 'aimed_departure_time' ], function (propertyName) {
								if (stop[propertyName]) {
									stop[propertyName] = new Date(date + ' ' + stop[propertyName]);
									// TODO: the line below is to detect arrivals in the 
									// early hours of the following day, but it is not
									// ideal 
									if (((new Date()).getHours() > 18) && (stop[propertyName].getHours() < 4)) {
										stop[propertyName].setDate(stop[propertyName].getDate() + 1);
									}
								}
							});
						});
						callback(err, results);
					}
				);
			});
		},
});

exports.getScheduledService = function (service, stationCode, dateTime, callback) {
	getScheduledServiceCached.get(service + '_' + stationCode + '_' + dateTime.getTime(), callback);
}

var getScheduledDeparturesCached = new AsyncCache({
	'max': 1000, // TODO: does this number make sense?
	'load': function (key, callback) {
			initialise(function (err) {
				var fromStationCode = key.split('_')[0],
					toStationCode = key.split('_')[1],
					dateTime = new Date(parseInt(key.split('_')[2])),
					date = dateTime.getFullYear() + "-" + (dateTime.getMonth() < 9 ? '0' : '') + (dateTime.getMonth() + 1) + "-" + (dateTime.getDate() < 10 ? '0' : '') + dateTime.getDate(),
					time = (dateTime.getHours() < 10 ? '0' : '') + dateTime.getHours() + ":" + (dateTime.getMinutes() < 10 ? '0' : '') + dateTime.getMinutes();
				request.get(
					'http://transportapi.com/v3/uk/train/station/' + fromStationCode + '/' + date + '/' + time + '/timetable.json',
					{
						'qs': {
							'calling_at': toStationCode,
							'api_key': SECRET.api_key,
							'app_id': SECRET.application_id,
						},
						'json': true,
					},
					function (err, response, results) {
						results = (results.departures || { all: [ ] }).all; 
						_.each(results, function (departure) {
							departure.origin_code = stationCodeFromName(departure.origin_name);
							delete departure.origin_name;
							departure.destination_code = stationCodeFromName(departure.destination_name);
							delete departure.destination_name;
							departure.aimed_departure_time = new Date(date + ' ' + departure.aimed_departure_time);
							// TODO: the line below is to detect arrivals in the 
							// early hours of the following day, but it is not
							// ideal 
							if (((new Date()).getHours() > 18) && (departure.aimed_departure_time.getHours() < 4)) {
								departure.aimed_departure_time.setDate(departure.aimed_departure_time.getDate() + 1);
							}
						});
						callback(err, results);
					}
				);
			});
		},
});

exports.getScheduledDepartures = function (fromStationCode, toStationCode, dateTime, callback) {
	getScheduledDeparturesCached.get(fromStationCode + '_' + toStationCode + '_' + dateTime.getTime(), callback);
}

var getLiveArrivalsCached = new AsyncCache({
	'maxAge': 60000,
	'load': function (stationCode, callback) {
			initialise(function (err) {
				request.get(
					'http://transportapi.com/v3/uk/train/station/' + stationCode + '/live_arrivals.json',
					{
						'qs': {
							'api_key': SECRET.api_key,
							'app_id': SECRET.application_id,
						},
						'json': true,
					},
					function (err, response, results) {
						// TODO: manage situation in which there is no 
						// results.arrivals.all : does that happen when I run out of
						// API allowance? 
						results = (results.arrivals || { all: [ ] }).all;
						var entryDate = new Date(),
							entryDateAsString = entryDate.getFullYear() + "/" + (entryDate.getMonth() < 9 ? '0' : '') + (entryDate.getMonth() + 1) + "/" + (entryDate.getDate() < 10 ? '0' : '') + entryDate.getDate() + " ";
						_.each(results, function (arrival) {
							arrival.origin_code = stationCodeFromName(arrival.origin_name);
							delete arrival.origin_name;
							arrival.destination_code = stationCodeFromName(arrival.destination_name);
							delete arrival.destination_name;
							_.each([ 'aimed_departure_time', 'expected_departure_time', 'aimed_arrival_time', 'expected_arrival_time'], function (propertyName) {
								if (arrival[propertyName]) {
									arrival[propertyName] = new Date(entryDateAsString + arrival[propertyName]);
									// TODO: the line below is to detect arrivals in the 
									// early hours of the following day, but it is not
									// ideal 
									if ((entryDate.getHours() > 18) && (arrival[propertyName].getHours() < 4)) {
										arrival[propertyName].setDate(arrival[propertyName].getDate() + 1);
									}
								}
							});
						});
						results.sort(function (a, b) { return a.aimed_arrival_time.valueOf() - b.aimed_arrival_time.valueOf(); });
							callback(err, results);
					}
				);
		});
	},
});

exports.getLiveArrivals = function (stationCode, callback) {
	getLiveArrivalsCached.get(stationCode, callback);
};
