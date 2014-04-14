/* 
 * Read http://nrodwiki.rockshore.net/index.php/Schedule_Records for reference
 */ 

var AsyncCache = require('async-cache'),
	fs = require('fs'),
	es = require('event-stream'),
	path = require('path'),
	zlib = require('zlib'),
	_ = require('underscore');

var getScheduleCached = new AsyncCache({ 
	'maxAge': 24 * 60 * 60000, // 1 day 
	'load': function (key, callback) {
			var fromTiplocCodes = key.split('_')[0].split('-'),
				toTiplocCodes = key.split('_')[1].split('-'),
				dateTime = new Date(parseInt(key.split('_')[2])),
				limitTo = parseInt(key.split('_')[3]),
				dayOfWeek = dateTime.getDay() === 0 ? 6 : dateTime.getDay() - 1,
				csvDate = dateTime.getFullYear() + "-" + (dateTime.getMonth() < 9 ? '0' : '') + (dateTime.getMonth() + 1) + "-" + (dateTime.getDate() < 10 ? '0' : '') + dateTime.getDate();
			fs.createReadStream(path.join(__dirname, 'schedule.gz'), {flags: 'r'})
				.pipe(zlib.createUnzip())
				.pipe(es.split('\n'))
				.pipe(es.parse())
				.pipe(es.mapSync(function (data) {
					if (!data.JsonScheduleV1) return undefined;
					if (!data.JsonScheduleV1.schedule_segment) return undefined;
					if (!data.JsonScheduleV1.schedule_segment.schedule_location) return undefined;
					// I drop information for days different than the specified 
					if (data.JsonScheduleV1.schedule_days_runs.substring(dayOfWeek, dayOfWeek + 1) !== '1') return undefined;
					// I drop information about stations that are just 'passed through'
					data.JsonScheduleV1.schedule_segment.schedule_location = data.JsonScheduleV1.schedule_segment.schedule_location.filter(function (l) {
							return l.public_arrival || l.public_departure;
					});
					// NOTE: I the following I assume that the records in 
					// data.JsonScheduleV1.schedule_segment.schedule_location are 
					// ordered!
					// I drop information about trains that go the opposite direction to
					// the specified one or stop at just one of the stations
					var tiplocCodes = data.JsonScheduleV1.schedule_segment.schedule_location.map(function (l) { return l.tiploc_code; }),
						fromTiplocCode = _.intersection(tiplocCodes, fromTiplocCodes)[0],
						toTiplocCode = _.intersection(tiplocCodes, toTiplocCodes)[0];
					if ((tiplocCodes.indexOf(fromTiplocCode) === -1) || (tiplocCodes.indexOf(toTiplocCode) === -1) || (tiplocCodes.indexOf(fromTiplocCode) > tiplocCodes.indexOf(toTiplocCode))) return undefined;
					data.JsonScheduleV1.schedule_segment.schedule_location.forEach(function (l) {
						// I convert the stops public arrival and departure times in 
						// JavaScript dates
						[ { 'from': 'public_arrival', 'to': 'arrival' },
						  { 'from': 'public_departure', 'to': 'departure' } ].forEach(function (propertySettings) {
							if (l[propertySettings.from]) {
								l[propertySettings.to] = new Date(csvDate + ' ' + l[propertySettings.from].substring(0, 2) + ':' + l[propertySettings.from].substring(2, 4));
								delete l[propertySettings.from];
							}
						});
						// I delete the properties that won't be used further
						[ 'location_type', 'record_identity', 'tiploc_instance', 'pass', 'platform', 'line', 'path', 'engineering_allowance', 'pathing_allowance', 'performance_allowance' ].forEach(function (propertyName) {
							delete l[propertyName];
						});
					});
					// I discard the services that do not leave from fromTiplocCode in
					// the specified time window
					var fromPublicDeparture = data.JsonScheduleV1.schedule_segment.schedule_location.filter(function (l) { return l.tiploc_code === fromTiplocCode; })[0];
					if (fromPublicDeparture) fromPublicDeparture = fromPublicDeparture.departure;
					if (!fromPublicDeparture || (fromPublicDeparture.getTime() < dateTime.getTime()) || (fromPublicDeparture.getTime() >= dateTime.getTime() + limitTo * 3600000)) return undefined;
					// I convert the schedule validity dates to JavaScript dates and
					// filter out the schedule entries that do not match the request
					data.JsonScheduleV1.schedule_start_date = new Date(data.JsonScheduleV1.schedule_start_date + ' 0:00');
					data.JsonScheduleV1.schedule_end_date = new Date(data.JsonScheduleV1.schedule_end_date + ' 0:00');
					data.JsonScheduleV1.schedule_end_date.setDate(data.JsonScheduleV1.schedule_end_date.getDate() + 1);
					if ((data.JsonScheduleV1.schedule_segment.schedule_location[0].departure.getTime() < data.JsonScheduleV1.schedule_start_date) || (data.JsonScheduleV1.schedule_segment.schedule_location[0].departure.getTime() >= data.JsonScheduleV1.schedule_end_date.getTime())) return undefined;
					return { 
						'service': data.JsonScheduleV1.schedule_segment.CIF_train_service_code, 
						'stops': data.JsonScheduleV1.schedule_segment.schedule_location, 
					};
				}))
				.pipe(es.writeArray(function (err, array) {
					// I sort the results by the time they depart from fromTiplocCode
					array.sort(function (a, b) { return a.stops.filter(function (l) { return _.contains(fromTiplocCodes, l.tiploc_code); })[0].departure.getTime() - b.stops.filter(function (l) { return _.contains(fromTiplocCodes, l.tiploc_code); })[0].departure.getTime(); });
					callback(err, array);
		    	}));
		}
});

exports.getSchedule = function (fromTiplocCodes, toTiplocCodes, options, callback) {
	fromTiplocCodes = [ ].concat(fromTiplocCodes).sort();
	toTiplocCodes = [ ].concat(toTiplocCodes).sort();
	if (_.isDate(options)) options = { 'dateTime': options };
	if (!options.dateTime) options.dateTime = new Date();
	if (!options.limitTo) options.limitTo = 2; 
	getScheduleCached.get(fromTiplocCodes.join('-') + '_' + toTiplocCodes.join('-') + '_' + options.dateTime.getTime() + '_' + options.limitTo, callback);
};
