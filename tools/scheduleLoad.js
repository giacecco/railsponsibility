var argv = require("optimist")
		.usage("Usage: $0 --in <input gzip'ed file> --dbname <CouchDB database name> [--server <CouchDB server URL>]")
		.demand([ 'dbname', 'in', 'server' ])
		.alias('dbname', 'd')
		.alias('in', 'i')
		.alias('server', 's')
		.default('server', 'http://localhost:5984')
		.argv,
	async = require('async'),
	fs = require('fs'),
	es = require('event-stream'),
	request = require('request'),
	utils = require('../utils'),
	zlib = require('zlib'),
	_ = require('underscore');

var out = fs.createWriteStream(argv.in + '.new');
out.write('{ "data":[', 'utf8', function (err) {
	var inStream = fs.createReadStream(argv.in, {flags: 'r'})
		.pipe(zlib.createUnzip())
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
				callback(null, data);		
			}
		}))
		.pipe(es.stringify())
		.pipe(es.join(','))
		.pipe(out);
	inStream.on('end', function() {
		out.write(']}', 'utf8', function (err) {
			out.end();
		});
	});
});

	/*
	.pipe(request({ 
		'url': 'http://localhost:5984/test1/_bulk_docs',
		'method': 'POST',
		'json': true,
	}, function (err, response, body) { 
		console.log(body);
	}));;
	*/