/* 
 * Read http://nrodwiki.rockshore.net/index.php/Schedule_Records for reference
 */ 

var async = require('async'),
	AsyncCache = require('async-cache'),
	es = require('event-stream'),
	_ = require('underscore');

module.exports = function (options) { 

	var nano = require('nano')(options.couchDb || 'http://localhost:5984');	

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
					db.view('items_by_stop', 'items_by_stop', { 'limit': 10, 'startkey': tiplocCode + '_' + dateTime.getTime(), 'endkey': tiplocCode + '_86399999' }, function (err, results) {
						memo = memo.concat(results.rows);
						callback(null, memo);
					});
				}, function (err, results) {
					results = results.map(function (r) { return r.value; });
					results = results.reduce(function (memo, result) {
						// I drop information about trains that go the opposite direction to
						// the specified one or stop at just one of the stations
						var tiplocCodes = result.stops.map(function (stop) { return stop.tiploc_code; }),
							fromTiplocCode = _.intersection(tiplocCodes, fromTiplocCodes)[0],
							toTiplocCode = _.intersection(tiplocCodes, toTiplocCodes)[0];
						if (!((tiplocCodes.indexOf(fromTiplocCode) === -1) || (tiplocCodes.indexOf(toTiplocCode) === -1) || (tiplocCodes.indexOf(fromTiplocCode) > tiplocCodes.indexOf(toTiplocCode)))) memo.push(result);
						return memo;
					}, [ ]);
					results.sort(function (a, b) {
						return (new Date(a.stops.filter(function (s) { return _.contains(fromTiplocCodes, s.tiploc_code); })[0].departure)).getTime() - (new Date(b.stops.filter(function (s) { return _.contains(fromTiplocCodes, s.tiploc_code); })[0].departure)).getTime();
					});
					callback(null, results);
				})
			},
	});
/*

						// I discard the services that do not leave from fromTiplocCode in
						// the specified time window
						var fromPublicDeparture = data.JsonScheduleV1.schedule_segment.schedule_location.filter(function (l) { return l.tiploc_code === fromTiplocCode; })[0];
						if (fromPublicDeparture) fromPublicDeparture = fromPublicDeparture.departure;
						if (!fromPublicDeparture || (fromPublicDeparture.getTime() < dateTime.getTime()) || (fromPublicDeparture.getTime() >= dateTime.getTime() + limitTo * 3600000)) return undefined;
*/

	var getSchedule = function (fromTiplocCodes, toTiplocCodes, options, callback) {
		fromTiplocCodes = [ ].concat(fromTiplocCodes).sort();
		toTiplocCodes = [ ].concat(toTiplocCodes).sort();
		if (_.isDate(options)) options = { 'dateTime': options };
		if (!options.dateTime) options.dateTime = new Date();
		if (!options.limitTo) options.limitTo = 2; 
		getScheduleCached.get(fromTiplocCodes.join('-') + '_' + toTiplocCodes.join('-') + '_' + options.dateTime.getTime() + '_' + options.limitTo, callback);
	};

	return {
		"getSchedule": getSchedule,
	};

}
