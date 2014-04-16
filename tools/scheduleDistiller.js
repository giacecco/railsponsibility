var argv = require("optimist")
		.usage("Usage: $0 --in <input gzip'ed file> [--out <output folder>] --dateFrom <date in YYYY-MM-DD format> [--dateTo <date in YYYY-MM-DD format>]")
		.demand([ 'in', 'dateFrom' ])
		.alias('in', 'i')
		.alias('out', 'o')
		.argv,
	fs = require('fs'),
	es = require('event-stream'),
	path = require('path'),
	utils = require('../utils'),
	zlib = require('zlib'),
	_ = require('underscore');

function generateScheduleByDate (fromFile, toFile, dateTime, callback) {
	var fromDate = new Date(dateTime.getFullYear(), dateTime.getMonth(), dateTime.getDate()),
		toDate = new Date(fromDate);
	toDate.setDate(toDate.getDate() + 1);
	var dayOfWeek = fromDate.getDay() === 0 ? 6 : fromDate.getDay() - 1,
		csvDate = fromDate.getFullYear() + "-" + (fromDate.getMonth() < 9 ? '0' : '') + (fromDate.getMonth() + 1) + "-" + (fromDate.getDate() < 10 ? '0' : '') + fromDate.getDate(),
		outStream = fs.createWriteStream(toFile);
	outStream.write("[", function () {
		var inStream = fs.createReadStream(fromFile, {flags: 'r'});
		inStream.on('end', function () { 
			outStream.write(']', function () {
			    callback(null);
			});
		});
		inStream.pipe(zlib.createUnzip())
			.pipe(es.split('\n'))
			.pipe(es.parse())
			.pipe(es.mapSync(function (data) {
				if (!data.JsonScheduleV1) return undefined; 
				if (!data.JsonScheduleV1.schedule_segment && (data.JsonScheduleV1.transaction_type !== 'Create')) return undefined; 
				if (!data.JsonScheduleV1.schedule_segment.schedule_location) return undefined; 
				data = data.JsonScheduleV1;
				// I convert all dates to JavaScript dates
				data.schedule_start_date = new Date(data.schedule_start_date + ' 0:00');
				data.schedule_end_date = new Date(data.schedule_end_date + ' 0:00');
				data.schedule_end_date.setDate(data.schedule_end_date.getDate() + 1);
				// I drop all schedule items that do not apply to the specified 
				// date
				if (!((data.schedule_start_date.getTime() <= fromDate.getTime()) &&
					  (data.schedule_end_date.getTime() >= toDate.getTime()))) return undefined;
				// I drop information for days different than the specified 
				if (data.schedule_days_runs.substring(dayOfWeek, dayOfWeek + 1) !== '1') return undefined;
				// I drop information about stations that are just 'passed through'
				data.schedule_segment.schedule_location = data.schedule_segment.schedule_location.filter(function (l) {
					return l.public_arrival || l.public_departure;
				});
				// I convert the stops public arrival and departure times in 
				// JavaScript dates
				data.schedule_segment.schedule_location.forEach(function (l) {
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
				return data;
			}))
			.pipe(es.stringify())
			.pipe(es.join(','))
			.pipe(outStream);
	});
}

var fromDate = new Date(argv.dateFrom + ' 0:00'),
	toDate = new Date((argv.dateTo ? argv.dateTo : argv.dateFrom) + ' 0:00');
	toDate.setDate(toDate.getDate() + 1);
for (var d = fromDate.getTime(); d < toDate.getTime(); d += 24 * 60 * 60000) {
	var filename = new Date(d);
	filename = filename.getFullYear() + (filename.getMonth() < 9 ? '0' : '') + (filename.getMonth() + 1) + (filename.getDate() < 10 ? '0' : '') + filename.getDate() + '.json';
	generateScheduleByDate(argv.in, path.join(argv.out || '.', filename), new Date(d), function (err) { });	
}
