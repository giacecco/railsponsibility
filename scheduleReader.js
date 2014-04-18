/* 
 * Read http://nrodwiki.rockshore.net/index.php/Schedule_Records for reference
 */ 

var async = require('async'),
	AsyncCache = require('async-cache'),
	es = require('event-stream'),
	_ = require('underscore');

module.exports = function (options) { 

	var codesReader = new require('./codesReader')(options),
		nano = require('nano')(options.couchDb || 'http://localhost:5984'),
		utils = require('./utils');	

	var getScheduleCached = new AsyncCache({ 
		'maxAge': 24 * 60 * 60000, // 1 day 
		'load': function (key, callback) {
				var fromTiplocCodes = key.split('_')[0].split('-'),
					toTiplocCodes = key.split('_')[1].split('-'),
					dateTime = new Date(parseInt(key.split('_')[2])),
					limitTo = parseInt(key.split('_')[3]),
					dayOfWeek = dateTime.getDay() === 0 ? 6 : dateTime.getDay() - 1,
					csvDate = dateTime.getFullYear() + "-" + (dateTime.getMonth() < 9 ? '0' : '') + (dateTime.getMonth() + 1) + "-" + (dateTime.getDate() < 10 ? '0' : '') + dateTime.getDate(),
					db = nano.use('schedule_' + dateTime.getFullYear() + (dateTime.getMonth() < 9 ? '0' : '') + (dateTime.getMonth() + 1) + (dateTime.getDate() < 10 ? '0' : '') + dateTime.getDate());
				async.reduce(fromTiplocCodes, [ ], function (memo, tiplocCode, callback) {
					db.view('schedule_reader', 'items_by_departure_tiploc', { 'startkey': tiplocCode + '_' + dateTime.getTime(), 'endkey': tiplocCode + '_86399999' }, function (err, results) {
						memo = memo.concat(results.rows);
						callback(null, memo);
					});
				}, function (err, results) {
					results = results.map(function (r) { return r.value; });
					// I drop results that do not match the query
					results = results.reduce(function (memo, result) {
						var tiplocCodes = result.stops.map(function (stop) { return stop.tiploc_code; }),
							fromTiplocCode = _.intersection(tiplocCodes, fromTiplocCodes)[0],
							toTiplocCode = _.intersection(tiplocCodes, toTiplocCodes)[0];
						// I drop information about trains that do not stop
						// at both required stations or go the opposite 
						// direction to the specified one 
						if (!(!fromTiplocCode || !toTiplocCode || (tiplocCodes.indexOf(fromTiplocCode) > tiplocCodes.indexOf(toTiplocCode)))) {
							// I convert all dates to JavaScript dates
							result.stops.forEach(function (stop) {
								if (stop.departure) stop.departure = new Date(stop.departure);
								if (stop.arrival) stop.arrival = new Date(stop.arrival);
							});
							// I discard the services that do not leave from 
							// fromTiplocCode in the specified time window
							var fromDeparture = result.stops.filter(function (l) { return l.tiploc_code === fromTiplocCode; })[0].departure;
						    if (!((fromDeparture.getTime() < dateTime.getTime()) || (fromDeparture.getTime() >= dateTime.getTime() + limitTo * 3600000))) {
								memo.push(result);								    	
							}
						}     				
						return memo;
					}, [ ]);
					// I sort by departure from fromTiplocCodes; note that 
					// commonly, for human users, services are instead ordered 
					// by arrival at toTiplocCodes
					results.sort(function (a, b) {
						return (a.stops.filter(function (s) { return _.contains(fromTiplocCodes, s.tiploc_code); })[0].departure).getTime() - (b.stops.filter(function (s) { return _.contains(fromTiplocCodes, s.tiploc_code); })[0].departure).getTime();
					});
					callback(null, results);
				})
			},
	});

	var getScheduleByTiplocs = function (fromTiplocCodes, toTiplocCodes, options, callback) {
		fromTiplocCodes = [ ].concat(fromTiplocCodes).sort();
		toTiplocCodes = [ ].concat(toTiplocCodes).sort();
		if (_.isDate(options)) options = { 'dateTime': options };
		if (!options.dateTime) options.dateTime = new Date();
		if (!options.limitTo) options.limitTo = 2; 
		getScheduleCached.get(fromTiplocCodes.join('-') + '_' + toTiplocCodes.join('-') + '_' + options.dateTime.getTime() + '_' + options.limitTo, callback);
	};

	return {
		"getScheduleByTiplocs": getScheduleByTiplocs,
	};

}
