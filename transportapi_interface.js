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

var async = require('async'),
	cheerio = require('cheerio'),
	csv = require('csv'),
	fs = require('fs'),
	path = require('path'),
	request = require('request'),
	_ = require('underscore'),
	_str = require('underscore.string');
_.mixin(_str.exports());

var SECRET_FILENAME = path.join(__dirname, "TRANSPORTAPI_SECRET.json"),
	SECRET = null;

var log = function (s) {
	var entryDate = new Date();
	console.log(entryDate.getFullYear() + "/" + (entryDate.getMonth() < 9 ? '0' : '') + (entryDate.getMonth() + 1) + "/" + (entryDate.getDate() < 10 ? '0' : '') + entryDate.getDate() + " " + (entryDate.getHours() < 10 ? '0' : '') + entryDate.getHours() + ":" + (entryDate.getMinutes() < 10 ? '0' : '') + entryDate.getMinutes() + ":" + (entryDate.getSeconds() < 10 ? '0' : '') + entryDate.getSeconds() + " - " + s);
}

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
	return _.map(STATION_CODES, function (couple) {
		return { 'StationName': couple.StationName, 'levenshtein': _.levenshtein(code, couple.CrsCode) }
	}).sort(function (a, b) { return a.levenshtein - b.levenshtein; })[0].StationName;
});

exports.getScheduledService_BAK = function (service, stationCode, date, time, callback) {
	initialise(function (err) {
		request.get(
			'http://transportapi.com/v3/uk/train/service/' + service + '/' + stationCode + '/' + date + '/' + time + '/timetable',
			{
				'qs': {
					'api_key': SECRET.api_key,
					'app_id': SECRET.application_id,
				},
			},
			function (err, response, body) {
				var results = {
						'service': service,
						'calling_at': [ ],
					},
					$ = cheerio.load(body);
				$('body table:nth-of-type(1) tr:not(:first-child)').each(function (i, element) {
					results.calling_at.push({
						'station_code': stationCodeFromName($('td:nth-of-type(1)', this).text()),
						'aimed_arrival_time': ($('td:nth-of-type(2)', this).text() === '-' ? null : $('td:nth-of-type(2)', this).text()),
						'aimed_departure_time': ($('td:nth-of-type(3)', this).text() === '-' ? null : $('td:nth-of-type(3)', this).text()),
					});
				});
				callback(err, results);
			}
		);
	});
};

exports.getScheduledService = function (service, stationCode, date, time, callback) {
	initialise(function (err) {
		request.get(
			'http://transportapi.com/v3/uk/train/service/' + service + '/' + stationCode + '/' + date + '/' + time + '/timetable.json',
			{
				'qs': {
					'api_key': SECRET.api_key,
					'app_id': SECRET.application_id,
					'stationcode': stationCode,
				},
			},
			function (err, response, body) {
				var results = body;
				callback(err, results);
			}
		);
	});
};

exports.getScheduledDepartures = function (fromStationCode, toStationCode, dateTime, callback) {
	initialise(function (err) {
		var date = dateTime.getFullYear() + "-" + (dateTime.getMonth() < 9 ? '0' : '') + (dateTime.getMonth() + 1) + "-" + (dateTime.getDate() < 10 ? '0' : '') + dateTime.getDate(),
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
			function (err, response, body) {
				var results = body.departures.all; 
				_.each(results, function (departure) {
					departure.origin_code = stationCodeFromName(departure.origin_name);
					delete departure.origin_name;
					departure.destination_code = stationCodeFromName(departure.destination_name);
					delete departure.destination_name;
				});
				callback(err, results);
			}
		);
	});
};

exports.getLiveArrivals = function (stationCode, callback) {
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
				results = results.arrivals.all;
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
};