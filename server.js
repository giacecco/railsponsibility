var argv = require("yargs")
		.usage("Usage: $0 [--couchdb <CouchDB connection string if not specified in the COUCH_DB environment variable nor http://localhost:5984>]")
		.demand([ 'couchdb' ])
		.default('couchdb', process.env.CLOUDANT_URL)
		.argv,
	trainsMonitor = new require('./trainsMonitor')({ 'couchdb': argv.couchdb }),
	twitter = new require('./twitter')(),
	utils = require('./utils'),
	_ = require('underscore');

var monitoredTrains = { };

var prettyPrintTime = function (dateTime) {
	return dateTime.getHours() + ":" + (dateTime.getMinutes() < 10 ? '0' : '') + dateTime.getMinutes();
}

var manageArrival = function (from, to, aimedDepartureTime, fullArrivalInfo) {
	var monitoredTrainKey = from + '_' + to + '_' + aimedDepartureTime.getTime(),
		delay = Math.floor((fullArrivalInfo.actualArrivalTime - fullArrivalInfo.aimedArrivalTime) / 60000); 
	if (true || delay > 0) {
		_.each(monitoredTrains[monitoredTrainKey].users, function (user) {
			utils.log("server: Notifying @" + user + " of arrival.");
			twitter.updateStatus("@" + user + " your train leaving from " + from + " to " + to + " at " + prettyPrintTime(aimedDepartureTime) + " has arrived " + (delay > 0 ? delay + " minutes late, at " + fullArrivalInfo.actualArrivalTime.getHours() + ":" + (fullArrivalInfo.actualArrivalTime.getMinutes() < 10 ? '0' : '') + fullArrivalInfo.actualArrivalTime.getMinutes() : "on time"));	
		});	
	}
	delete monitoredTrains[monitoredTrainKey];
}

function addMonitor (from, to, aimedDepartureTime, user) {
	var monitoredTrainKey = from + '_' + to + '_' + aimedDepartureTime.getTime();
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
setTimeout(function () {
	twitter.listen(function (err, tweet) {
		var input = tweet.message.toUpperCase().match(/^(@[A-Z\d]+) *FROM *([A-Z]{3}) *TO* ([A-Z]{3}) *((\d{1,2}:)?\d{0,4})$/);
		if (!input) {
			utils.log("server: Received invalid tweet: '" + tweet.message + "'");
			// TODO: the tweet does not match the expected format, should I tell
			// the user or just ignore?
		} else {
			var fromStation = input[2].toUpperCase(),
				toStation = input[3].toUpperCase(),
				dateTime = new Date(), // TODO: what about train between days?
				aimedDepartureTime = dateTime.getFullYear() + "-" + (dateTime.getMonth() < 9 ? '0' : '') + (dateTime.getMonth() + 1) + "-" + (dateTime.getDate() < 10 ? '0' : '') + dateTime.getDate() + ' ',
				aimedDepartureTime = new Date(aimedDepartureTime + (input[5] ? input[4] : input[4].substring(0, input[4].length - 2) + ':' + input[4].substring(input[4].length - 2, input[4].length))); 
			utils.log("server: Received tweet from @" + tweet.from + " requesting to monitor " + prettyPrintTime(aimedDepartureTime) + " from " + fromStation + " to " + toStation);
			setTimeout(function () {
				// artificially adding some delay to make it look more real :-)
				utils.log("server: Sending acknowledgement tweet to @" + tweet.from);
				twitter.updateStatus("@" + tweet.from + " thank you for using Railsponsibility, we will tweet back when the train from " + fromStation + " at " + prettyPrintTime(aimedDepartureTime) + " has arrived at " + toStation);	
			}, 5000);
			addMonitor(fromStation, toStation, aimedDepartureTime, tweet.from);
		};
	});
, 60000);
