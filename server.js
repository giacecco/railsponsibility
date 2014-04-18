var argv = require("optimist")
		.usage("Usage: $0 [--couchdb <CouchDB connection string if not specified in the COUCH_DB environment variable nor http://localhost:5984>]")
		.demand([ 'couchdb' ])
		.default('couchdb', process.env.COUCH_DB || 'http://localhost:5984')
		.argv,
	log = require('./utils').log,
	twitter = require('./twitter'),
	trainsMonitor = require('./trainsMonitor')({ 'couchDb': argv.couchdb }),
	_ = require('underscore');

var monitoredTrains = { };

var manageArrival = function (from, to, aimedDepartureTime, fullArrivalInfo) {
	var monitoredTrainKey = from + '_' + to + '_' + aimedDepartureTime.getDate(),
		delay = Math.floor((fullArrivalInfo.actualArrivalTime - fullArrivalInfo.aimedArrivalTime) / 60000); 
	if (true || delay > 0) {
		_.each(monitoredTrains[monitoredTrainKey].users, function (user) {
			log("server: Notifying @" + user + " of arrival.");
			twitter.updateStatus("@" + user + " your train leaving from " + from + " to " + to + " at " + aimedDepartureTime.getHours() + ":" + (aimedDepartureTime.getMinutes() < 10 ? '0' : '') + aimedDepartureTime.getMinutes() + " has arrived " + (delay > 0 ? delay + " minutes late, at " + fullArrivalInfo.actualArrivalTime.getHours() + ":" + (fullArrivalInfo.actualArrivalTime.getMinutes() < 10 ? '0' : '') + fullArrivalInfo.actualArrivalTime.getMinutes() : "on time"));	
		});	
	}
	delete monitoredTrains[monitoredTrainKey];
}

function addMonitor (from, to, aimedDepartureTime, user) {
	var monitoredTrainKey = from + '_' + to + '_' + aimedDepartureTime.getDate();
	if (!monitoredTrains[monitoredTrainKey]) {
		monitoredTrains[monitoredTrainKey] = {
			users: [ ],
			monitor: trainsMonitor.create(from, to, aimedDepartureTime, _.bind(manageArrival, { }, from, to, aimedDepartureTime)),
		};
	}
	monitoredTrains[monitoredTrainKey].users.push(user);	
}

/* example tweet:
 *     @railspo from eus to bkm 934
 */
twitter.listen(function (err, tweet) {
	var input = tweet.message.toUpperCase().match(/^(@[A-Z\d]+) *FROM *([A-Z]{3}) *TO* ([A-Z]{3}) *((\d{1,2}:)?\d{0,4})$/);
	if (!input) {
		log("server: Received invalid tweet: '" + tweet.message + "'");
		// TODO: the tweet does not match the expected format, should I tell
		// the user or just ignore?
	} else {
		var fromStation = input[2],
			toStation = input[3],
			dateTime = new Date(), // TODO: what about train between days?
			aimedDepartureTime = dateTime.getFullYear() + "-" + (dateTime.getMonth() < 9 ? '0' : '') + (dateTime.getMonth() + 1) + "-" + (dateTime.getDate() < 10 ? '0' : '') + dateTime.getDate() + ' ',
			aimedDepartureTime = new Date(aimedDepartureTime + (input[5] ? input[4] : input[4].substring(0, input[4].length - 2) + ':' + input[4].substring(input[4].length - 2, input[4].length))); 
		log("server: Received tweet from @" + tweet.from + " requesting to monitor " + aimedDepartureTime.getHours() + ":" + (aimedDepartureTime.getMinutes() < 10 ? '0' : '') + aimedDepartureTime.getMinutes() + " from " + fromStation + " to " + toStation);
		addMonitor(fromStation, toStation, aimedDepartureTime, tweet.from);
	}
});

