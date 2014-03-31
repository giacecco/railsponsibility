var transportapi = require('./transportapi_interface');

module.exports = function (stationCode) {

	var _stationCode = stationCode;

	var getArrivals = function (callback) {
		transportapi.getArrivals(_stationCode, callback);
	};

	return {
		'getArrivals': getArrivals
	};

}