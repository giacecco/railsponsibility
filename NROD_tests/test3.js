/* 
 * Read http://nrodwiki.rockshore.net/index.php/Schedule_Records for reference
 */ 

var fs = require('fs'),
	es = require('event-stream'),
	zlib = require('zlib'),
	_ = require('underscore');

function getSchedule (fromTiplocCode, toTiplocCode, options, callback) {
	if (_.isDate(options)) options = { 'dateTime': options };
	options.limitTo = options.limitTo || 2; // hours
	var dayOfWeek = options.dateTime.getDay() === 0 ? 6 : options.dateTime.getDay() - 1,
		csvDate = options.dateTime.getFullYear() + "-" + (options.dateTime.getMonth() < 9 ? '0' : '') + (options.dateTime.getMonth() + 1) + "-" + (options.dateTime.getDate() < 10 ? '0' : '') + options.dateTime.getDate();
	fs.createReadStream("./schedule.gz", {flags: 'r'})
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
			var tiplocCodes = data.JsonScheduleV1.schedule_segment.schedule_location.map(function (l) { return l.tiploc_code; });
			if ((tiplocCodes.indexOf(fromTiplocCode) === -1) || (tiplocCodes.indexOf(toTiplocCode) === -1) || (tiplocCodes.indexOf(fromTiplocCode) > tiplocCodes.indexOf(toTiplocCode))) return undefined;
			// I convert the stops public arrival and departure times in 
			// JavaScript dates
			data.JsonScheduleV1.schedule_segment.schedule_location.forEach(function (l) {
				[ 'public_arrival', 'public_departure' ].forEach(function (propertyName) {
					if (l[propertyName]) l[propertyName] = new Date(csvDate + ' ' + l[propertyName].substring(0, 2) + ':' + l[propertyName].substring(2, 4) + ':' + ((l[propertyName].substring(4, 5) === 'H') ? '30' : '00'));
				});
			});
			// I discard the services that do not leave from fromTiplocCode in
			// the specified time window
			var fromPublicDeparture = data.JsonScheduleV1.schedule_segment.schedule_location.filter(function (l) { return l.tiploc_code === fromTiplocCode; })[0];
			if (fromPublicDeparture) fromPublicDeparture = fromPublicDeparture.public_departure;
			if (!fromPublicDeparture || (fromPublicDeparture.getTime() < options.dateTime.getTime()) || (fromPublicDeparture.getTime() >= options.dateTime.getTime() + options.limitTo * 3600000)) return undefined;
			// I convert the schedule validity dates to JavaScript dates and
			// filter out the schedule entries that do not match the request
			data.JsonScheduleV1.schedule_start_date = new Date(data.JsonScheduleV1.schedule_start_date + ' 0:00');
			data.JsonScheduleV1.schedule_end_date = new Date(data.JsonScheduleV1.schedule_end_date + ' 0:00');
			data.JsonScheduleV1.schedule_end_date.setDate(data.JsonScheduleV1.schedule_end_date.getDate() + 1);
			if ((data.JsonScheduleV1.schedule_segment.schedule_location[0].public_departure.getTime() < data.JsonScheduleV1.schedule_start_date) || (data.JsonScheduleV1.schedule_segment.schedule_location[0].public_departure.getTime() >= data.JsonScheduleV1.schedule_end_date.getTime())) return undefined;
			return data;
		}))
		.pipe(es.writeArray(function (err, array){
			// I sort the results by the time they depart from fromTiplocCode
			array.sort(function (a, b) { return a.JsonScheduleV1.schedule_segment.schedule_location.filter(function (l) { return l.tiploc_code === fromTiplocCode; })[0].public_departure.getTime() - b.JsonScheduleV1.schedule_segment.schedule_location.filter(function (l) { return l.tiploc_code === fromTiplocCode; })[0].public_departure.getTime(); });
			callback(err, array);
    	}));
}

getSchedule('BERKHMD', 'EUSTON', new Date(), function (err, results) {

	function prettyTime (dateTime) {
		return dateTime ? (dateTime.getHours() < 10 ? '0' : '') + dateTime.getHours() + ":" + (dateTime.getMinutes() < 10 ? '0' : '') + dateTime.getMinutes() : '-';
	}

	console.log("Found " + results.length + " services.");
	fs.writeFileSync('foo.json', JSON.stringify(results[0]));
	results.forEach(function (s) {
		console.log("*** Service from " + s.JsonScheduleV1.schedule_start_date + ' to ' + s.JsonScheduleV1.schedule_end_date);
		s.JsonScheduleV1.schedule_segment.schedule_location.forEach(function (l) {
			console.log("    " + l.tiploc_code + " " + prettyTime(l.public_arrival) + ' ' + prettyTime(l.public_departure));
		});
	});
});