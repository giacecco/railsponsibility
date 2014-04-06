var transportapi = require('./transportapi_interface'),
	_ = require('underscore');

var arrivalsMonitors = { };

// gets the list of calling stations from fromStationCode to destination for the
// first service calling at fromStationCode on or after dateTime
var getNextStops = function (fromStationCode, toStationCode, dateTime, callback) {
	transportapi.getScheduledDepartures(fromStationCode, toStationCode, dateTime, function (err, results) {
		if (err) {
			callback(err, [ ]);
		} else {
			var result = _.first(results);
			transportapi.getScheduledService(result.service, fromStationCode, result.aimed_departure_time, function (err, stops) {
				if (err) {
					callback(err, [ ]);
				} else {
					while ((_.first(stops).station_code !== fromStationCode) ||
						   (_.first(stops).aimed_arrival_time < dateTime)) {
						stops = _.rest(stops);
					}
					callback(null, { service: result.service, stops: stops });
				}				
			});
		}
	});
};

module.exports = function (stationCodeFrom, stationCodeTo, aimedDepartureTime, options) {

	// check the constructor's parameter
	// TODO: check that the stationCodes are recognised
	if (!_.isUndefined(options.arrivalCallback) && !_.isFunction(arrivalCallback)) 
		throw new Error('options.arrivalCallback must be a funciton.');
	if (!_.isUndefined(options.dataFolder) && !fs.existsSync(options.dataFolder)) 
		throw new Error('options.dataFolder must be an existing folder.')
	if (!_.isUndefined(options.dataFolder) && !fs.lstatSync(options.dataFolder).isDirectory())
		throw new Error('options.dataFolder must be an existing folder.')
	options.dataFolder = options.dataFolder || null;

	function manageArrival (trainInfo) {
		if (options.arrivalCallback) optionsCallback(trainInfo);
	} 

	getNextStops(stationCodeFrom, stationCodeTo, aimedDepartureTime, function (err, result) {
		// if the monitor for the destination station is not already in the 
		// pool, I create it
		if (!arrivalsMonitors[stationCodeTo]) {
			arrivalsMonitor = new require('./arrivalsMonitor')(stationCodeTo, {
					'dataFolder': options.dataFolder,
					'arrivalCallback': manageArrival,
			});
		};			
		arrivalsMonitors[stationCodeTo].limitTo(result.service, _.last(result.stops).aimed_arrival_time);
	});

	return { };

}
