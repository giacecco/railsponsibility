/* **************************************************************************
   transportapi_interface.js is a simple Node.js proxy to the Transport API
   apis we are using
   ************************************************************************** */

var fs = require('fs'),
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

exports.getArrivals = function (stationCode, callback) {
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