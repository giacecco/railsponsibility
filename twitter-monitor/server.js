var async = require("async"),
	argv = require("optimist")
		.usage('Usage: $0 --wwwroot <web server root folder> [--port <web server port to dowload csv report>]')
		.demand([ "wwwroot" ])
		// parameters that can be specified on the command line only
		.alias("filename", "f")
		.alias("wwwroot", "w")
		// defaults
		.default("port", 8080)
		.argv;
    twitter = require("./twitter");

function startSearch (err) {
    twitter.listen({ searchStrings: [ ].concat(argv.search) }, function (words) {
        process.stdout.write(Array(words.length + 1).join("."));
        inMemory.writeWords(words);
    });
}

function launchWebServer () {
	var express = require("express"),
		app = express(),
		path = require("path");
	app.use(express.static(argv.wwwroot));
	app.get('/data/', function(req, res){
		inMemory.toCSV({ 
			interval: req.query.interval || argv.interval ? parseInt(req.query.interval || argv.interval) : null,
			limit: req.query.limit || argv.limit ? parseInt(req.query.limit || argv.limit) : null, 
			other: ((typeof(req.query.other) === "string") ? req.query.other !== "false" : false) || argv.other
		}, function (err, csv) {
			res.setHeader('Content-Type', 'text/csv');
			res.setHeader('Content-Length', Buffer.byteLength(csv));
			res.end(csv);
		});
	})		;
	app.listen(parseInt(argv.port));
	console.log("The web server is listening at http://localhost" + (parseInt(argv.port) !== 80 ? ":" + argv.port : ""));
}

async.series([
	// all initialisation
    function (callback) { inMemory.initialise({ filename: argv.filename }, callback); }, 
    twitter.initialise
], function (err) {
	if (!err) {
		// all operations
		async.parallel([
			startSearch,
			launchWebServer
		]);
	}
});
