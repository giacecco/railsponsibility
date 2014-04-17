var argv = require("optimist")
		.usage("Usage: $0 --in <input gzip'ed file> --conn <Couch DB connection string> --dateFrom <date in YYYY-MM-DD format> [--dateTo <date in YYYY-MM-DD format>]")
		.demand([ 'in', 'conn', 'dateFrom' ])
		.alias('conn', 'c')
		.alias('in', 'i')
		.alias('out', 'o')
		.argv,
	async = require('async'),
	fs = require('fs'),
	es = require('event-stream'),
	nano = require('nano')(argv.conn),
	utils = require('../utils'),
	zlib = require('zlib'),
	_ = require('underscore');

function generateScheduleByDate (fromFile, toFile, dateTime, callback) {
	var fromDate = new Date(dateTime.getFullYear(), dateTime.getMonth(), dateTime.getDate()),
		toDate = new Date(fromDate);
	toDate.setDate(toDate.getDate() + 1);
	var dayOfWeek = fromDate.getDay() === 0 ? 6 : fromDate.getDay() - 1,
		dbname = 'schedule_' + fromDate.getFullYear() + (fromDate.getMonth() < 9 ? '0' : '') + (fromDate.getMonth() + 1) + (fromDate.getDate() < 10 ? '0' : '') + fromDate.getDate(),
		csvDate = fromDate.getFullYear() + "-" + (fromDate.getMonth() < 9 ? '0' : '') + (fromDate.getMonth() + 1) + "-" + (fromDate.getDate() < 10 ? '0' : '') + fromDate.getDate();
	nano.db.destroy(dbname, function(err) {
		nano.db.create(dbname, function(err) {
			// if (err) throw err;
		    var db = nano.use(dbname),
		    	inStream = fs.createReadStream(fromFile, {flags: 'r'});
			inStream.on('end', function () { 
			    callback(null);
			});
			inStream.pipe(zlib.createUnzip())
				.pipe(es.split('\n'))
				.pipe(es.parse())
				.pipe(es.map(function (data, callback) {
					if (!data.JsonScheduleV1) {
						callback(null, undefined); 
					} else if (!data.JsonScheduleV1.schedule_segment && (data.JsonScheduleV1.transaction_type !== 'Create')) {
						callback(null, undefined); 
					} else if (!data.JsonScheduleV1.schedule_segment.schedule_location) {
						callback(null, undefined); 
					} else {
						data = data.JsonScheduleV1;
						// I convert all dates to JavaScript dates
						data.schedule_start_date = new Date(data.schedule_start_date + ' 0:00');
						data.schedule_end_date = new Date(data.schedule_end_date + ' 0:00');
						data.schedule_end_date.setDate(data.schedule_end_date.getDate() + 1);
						// I drop all schedule items that do not apply to the specified 
						// date
						if (!((data.schedule_start_date.getTime() <= fromDate.getTime()) &&
							  (data.schedule_end_date.getTime() >= toDate.getTime()))) {
							callback(null, undefined);
						} else {
							// I drop information for days different than the specified 
							if (data.schedule_days_runs.substring(dayOfWeek, dayOfWeek + 1) !== '1') {
								callback (null, undefined);
							} else {
								// I drop information about stations that are just 'passed through'
								data.schedule_segment.schedule_location = data.schedule_segment.schedule_location.filter(function (l) {
									return l.public_arrival || l.public_departure;
								});
								// it can happen that some of the records have 
								// no stops! 
								if (data.schedule_segment.schedule_location.length === 0) {
									callback(null, undefined);
								} else {
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
									data = { 
										service: data.schedule_segment.CIF_train_service_code,
										stops: data.schedule_segment.schedule_location, 
									};
									db.insert(data, (_.last(data.stops).tiploc_code + '_' + data.service + '_' + _.last(data.stops).arrival.getTime()).toLowerCase(), function(err, body, header) {
										callback(null, data);
									});
								}
							}
						}
					}
			}));
		});
	});
}

var fromDate = new Date(argv.dateFrom + ' 0:00'),
	toDate = new Date((argv.dateTo ? argv.dateTo : argv.dateFrom) + ' 0:00');
	toDate.setDate(toDate.getDate() + 1);
async.eachSeries(_.range((toDate.getTime() - fromDate.getTime()) / 86400000), function (dayNo, callback) {
	utils.log("Distilling the schedule for " + new Date(fromDate.getTime() + 86400000 * dayNo));
	generateScheduleByDate(argv.in, argv.conn || 'http://localhost:5984', new Date(fromDate.getTime() + 86400000 * dayNo), callback);	
});
