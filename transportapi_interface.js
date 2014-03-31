var fs = require('fs'),
	request = require('request');

var SECRET_FILENAME = "./TRANSPORTAPI_SECRET.json",
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

exports.arrivalsMonitor = function(stationCode) {

	var _stationCode = stationCode;

	var getArrivals = function (callback) {
		initialise(function (err) {
			request.get(
				'http://transportapi.com/v3/uk/train/station/' + _stationCode + '/live_arrivals.json',
				{
					'qs': {
						'api_key': SECRET.api_key,
						'app_id': SECRET.application_id,
					},
					'json': true,
				},
				function (error, response, body) {
					callback(error, body);
				}
			);
		});
	}

	return { 
		getArrivals: getArrivals,
	};
};