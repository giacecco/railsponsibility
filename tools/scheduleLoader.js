/* **************************************************************************
   This script downloads the full schedule data and distills the specified
   dates into the CouchDB database.
   ************************************************************************** */

var argv = require("yargs")
		.usage("Usage: $0 --couchdb <Couch DB connection string> --dateFrom <date in YYYY-MM-DD format> [--dateTo <date in YYYY-MM-DD format>]")
		.demand([ 'couchdb', 'dateFrom' ])
		.default('couchdb', 'http://localhost:5984')
		.argv,
	async = require('async'),
	es = require('event-stream'),
	fs = require('fs'),
	nano = require('nano')(argv.couchdb),
	path = require('path'),
	request = require('request'),
	utils = require('../utils'),
	zlib = require('zlib'),
	_ = require('underscore'),
	_str = require('underscore.string');
_.mixin(_str.exports());

var COUCHDB_DESIGN_DOCUMENTS = [ 
	{ 'name': 'schedule_reader',
      'doc': {"language":"javascript","views":{"items_by_departure_tiploc":{"map":"function(doc) {\n    doc.stops.forEach(function (stop) {\n\t  emit(stop.tiploc_code + '_' + (new Date(stop.departure)).getTime(), doc);\n    });\n}"}}}, }, 
];

var readSecret = function () {
	var SECRET = { };
    if (fs.existsSync(path.join(__dirname, "..", '.env'))) {
    	// we are debugging locally
    	fs.readFileSync(path.join(__dirname, "..", '.env'), { 'encoding': 'utf-8' }).split('\n').filter(function (line) {
    		// TODO: there may be a better regular expression to eliminate
    		// spaces rather than using _.trim afterwards
    		line = line.match(/([^=]+)=(.+)$/);
    		if (line) SECRET[_.trim(line[1].toLowerCase())] = _.trim(line[2]);
    	});
    } else {
    	// we are likely in production
    	SECRET = _.clone(process.env);
    };
    return SECRET;
}

var createInputStream = function (callback) {
	var SECRET = readSecret();
	request({
		'url': 'https://datafeeds.networkrail.co.uk/ntrod/CifFileAuthenticate',
		'qs': {
			'type': 'CIF_ALL_FULL_DAILY',
			'day': 'toc-full',
		},
		'auth': {
			'user': SECRET.nrod_username,
			'pass': SECRET.nrod_password,
		},
		'followRedirect': false,
	}, function (err, response, body) {
		callback(null, request(response.headers.location));
	});
}

var generateScheduleByDate = function (fromFile, toFile, dateTime, returnCallback) {
	var fromDate = new Date(dateTime.getFullYear(), dateTime.getMonth(), dateTime.getDate()),
		toDate = new Date(fromDate);
	toDate.setDate(toDate.getDate() + 1);
	var dayOfWeek = fromDate.getDay() === 0 ? 6 : fromDate.getDay() - 1,
		dbname = 'schedule_' + fromDate.getFullYear() + (fromDate.getMonth() < 9 ? '0' : '') + (fromDate.getMonth() + 1) + (fromDate.getDate() < 10 ? '0' : '') + fromDate.getDate(),
		csvDate = fromDate.getFullYear() + "-" + (fromDate.getMonth() < 9 ? '0' : '') + (fromDate.getMonth() + 1) + "-" + (fromDate.getDate() < 10 ? '0' : '') + fromDate.getDate();
	utils.log("Creating database '" + dbname + "'...");
	nano.db.destroy(dbname, function(err) {
		nano.db.create(dbname, function(err) {
		    var db = nano.use(dbname);
		    // I create the views that are required by scheduleLoader
		    async.each(COUCHDB_DESIGN_DOCUMENTS, function (designDocument, callback) {
				utils.log("Creating design document '" + designDocument.name + "'...");
			    db.insert(designDocument.doc, '_design/' + designDocument.name, callback);
			}, function (err) {
				createInputStream(function (err, inStream) {
					inStream.on('end', function () { 
					});
					utils.log("Processing input file...");
					inStream.pipe(zlib.createUnzip())
						.pipe(es.split('\n'))
						.pipe(es.parse())
						.pipe(es.map(function (data, callback) {
							if (!data.JsonScheduleV1) {
								callback(null, undefined); 
							} else if (!data.JsonScheduleV1.schedule_segment || (data.JsonScheduleV1.transaction_type !== 'Create') || (data.JsonScheduleV1.applicable_timetable !== 'Y')) {
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
											callback(null, { 
												'_id': (_.last(data.schedule_segment.schedule_location).tiploc_code + '_' + data.schedule_segment.CIF_train_service_code + '_' + _.last(data.schedule_segment.schedule_location).arrival.getTime()).toLowerCase(),
												'atoc_code': data.atoc_code,
												'service': data.schedule_segment.CIF_train_service_code,
												'stops': data.schedule_segment.schedule_location, 
											});
										}
									}
								}
							}
						}))
						.pipe(es.writeArray(function (err, array) {
							utils.log("Writing to database...");
							db.bulk({ 'docs': array }, function (err) {
								if (err) throw err;
								async.eachSeries(COUCHDB_DESIGN_DOCUMENTS, function (designDocument, callback) {
									async.eachSeries(_.keys(designDocument.doc.views), function (viewName, callback) {
										utils.log("Initialising view '" + designDocument.name + '/' + viewName + "'...");
										// note that the startkey/endkey 
										// filtering here is just to limit the 
										// output to something manageable, I 
										// could get out of memory errors 
										// otherwise 
										db.view(designDocument.name, viewName, { 'startkey': 'a', 'endkey': 'a', 'include_docs': false }, callback);
									}, callback);
								}, function (err) {
									utils.log("Views initialisation completed.");
									returnCallback(err);
								});
							});
						}));
				});
			});
		});
	});
}

var fromDate = new Date(argv.dateFrom + ' 0:00'),
	toDate = new Date((argv.dateTo ? argv.dateTo : argv.dateFrom) + ' 0:00');
	toDate.setDate(toDate.getDate() + 1);
async.eachSeries(_.range((toDate.getTime() - fromDate.getTime()) / 86400000), function (dayNo, callback) {
	utils.log("Distilling the schedule for " + new Date(fromDate.getTime() + 86400000 * dayNo));
	generateScheduleByDate(argv.in, argv.conn || 'http://localhost:5984', new Date(fromDate.getTime() + 86400000 * dayNo), function (err) {
		utils.log("Distillation completed.");
		callback(null);
	});	
});
