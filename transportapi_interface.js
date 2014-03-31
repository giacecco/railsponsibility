/* **************************************************************************
   transportapi_interface.js is a simple Node.js proxy to the Transport API
   apis we are using
   ************************************************************************** */

var cheerio = require('cheerio'),
	fs = require('fs'),
	path = require('path'),
	request = require('request');

var SECRET_FILENAME = path.join(__dirname, "TRANSPORTAPI_SECRET.json"),
	SECRET = null;

var initialise = function (callback) {
	if (SECRET) {
		callback(null);
	} else {
		SECRET = fs.readFile(SECRET_FILENAME, function (err, contents) {
			SECRET = JSON.parse(contents);
			callback(err);
		});
	}
};

exports.getScheduledService = function (service, originStationCode, date, time, callback) {
	initialise(function (err) {
		request.get(
			'http://transportapi.com/v3/uk/train/service/' + service + '/' + originStationCode + '/' + date + '/' + time + '/timetable.json',
			{
				'qs': {
					'station_code': originStationCode,
					'api_key': SECRET.api_key,
					'app_id': SECRET.application_id,
				},
				'json': true,
			},
			function (err, response, body) {
				callback(err, body);
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
				callback(err, body);
			}
		);
	});
};