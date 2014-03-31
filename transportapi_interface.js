/* **************************************************************************
   transportapi_interface.js is a simple Node.js proxy to the Transport API
   apis we are using
   ************************************************************************** */

var async = require('async'),
	cheerio = require('cheerio'),
	csv = require('csv'),
	fs = require('fs'),
	path = require('path'),
	request = require('request'),
	_ = require('underscore');

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
			// fetches from Network Rail the latest list of stations and codes
			function (callback) {
				request.get('http://www.nationalrail.co.uk/static/documents/content/station_codes.csv', function (err, response, body) {
					csv()
						.from.string(body, {
							columns: true
						})
						.to.array(function (stationCodes) {
							STATION_CODES = stationCodes;
							callback(err);
						});
				});
			},
		], function (err) {
			callback(err);
		});
	}
};

var stationCodeFromName = _.memoize(function (name) {
	var code = _.filter(STATION_CODES, function (couple) { return couple['Station name'].toLowerCase() === name.toLowerCase(); });
	if (code.length === 0) {
		log("*** FAILED TO LOOK-UP THE CODE FOR STATION " + name);
		return name;
	} else {
		return code[0]['Code'];
	}
});

var stationNameFromCode = _.memoize(function (code) {
	var name = _.filter(STATION_CODES, function (couple) { return couple['Code'].toLowerCase() === code.toLowerCase(); });
	if (name.length === 0) {
		log("*** FAILED TO LOOK-UP THE NAME FOR CODE " + code);
		return code;
	} else {
		return name[0]['Station name'];
	}
});

exports.getScheduledService = function (service, stationCode, date, time, callback) {
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
				_.each(body.departures.all, function (departure) {
					departure.origin_code = stationCodeFromName(departure.origin_name);
					delete departure.origin_name;
					departure.destination_code = stationCodeFromName(departure.destination_name);
					delete departure.destination_name;
				});
				callback(err, body);
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
			function (err, response, body) {
				_.each(body.arrivals.all, function (arrival) {
					arrival.origin_code = stationCodeFromName(arrival.origin_name);
					delete arrival.origin_name;
					arrival.destination_code = stationCodeFromName(arrival.destination_name);
					delete arrival.destination_name;
				});
				callback(err, body);
			}
		);
	});
};