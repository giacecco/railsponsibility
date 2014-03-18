var csv = require("csv"),	
	fs = require('fs'),
	request = require('request');

var SECRET_FILENAME = "./STRIDE_SECRET.json",
	SECRET = JSON.parse(fs.readFileSync(SECRET_FILENAME)),
	stationCodes = null;

function init (callback) {
	if (stationCodes) {
		callback(null);
	} else {
		csv()
			.from.path('station_codes.csv', {
				columns: true
			})
			.to.array(function (data) { 
				stationCodes = data;
				callback(null);
			});
	}
}

exports.getStations = function (callback) {
	var STATIONS_SYNONYMS = {
		"BKM": [ "berko", "berkhampstead" ],
		"EUS": [ "euston", "londoneuston", "eus" ]
	};
	init(function (err) {
		callback(
			err, 
			stationCodes.map(function (station) { 
				return { 
					fullName: station["Station name"], 
					code: station["Code"],
					synonyms: STATIONS_SYNONYMS[station["Code"]] ? STATIONS_SYNONYMS[station["Code"]] : [ ]
				}}
			)
		);
	});
}

exports.getArrivals = function (stationCode, callback) {
	init(function (err) {
		request.get(
			'http://api.stride-project.com/transportapi/7c60e7f4-20ff-11e3-857c-fcfb53959281/train/station/' + stationCode + '/live_arrivals?[limit=]', 
			{
				'json': true,
				'auth': {
				    'user': SECRET.username,
				    'pass': SECRET.password
				},
				'headers': {
			        'x-api-key': SECRET.api_key
	    		}
			},
			function (error, response, body) {
				callback(error, body);
			}
		);
	});
}
