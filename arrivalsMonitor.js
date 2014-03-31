var POLL_FREQUENCY = Math.ceil(24 * 60 * 60 / 1000 * 2); // seconds

var csv = require('csv'),
	fs = require('fs'),
	path = require('path'),
	transportapi = require('./transportapi_interface'),
	_ = require('underscore');

module.exports = function (stationCode, dataFolder) {

	// delayedTrains is a hash of all trains that are late or have been late that
	// have not arrived yet
	var delayedTrains = { },
		_stationCode = stationCode,
		_dataFolder = dataFolder;

	var log = function (s) {
		var entryDate = new Date();
		console.log(entryDate.getFullYear() + "/" + (entryDate.getMonth() < 9 ? '0' : '') + (entryDate.getMonth() + 1) + "/" + (entryDate.getDate() < 10 ? '0' : '') + entryDate.getDate() + " " + (entryDate.getHours() < 10 ? '0' : '') + entryDate.getHours() + ":" + (entryDate.getMinutes() < 10 ? '0' : '') + entryDate.getMinutes() + ":" + (entryDate.getSeconds() < 10 ? '0' : '') + entryDate.getSeconds() + " - " + s);
	}

	// returns all trains arriving at the station that are currently live and
	// are or have been delayed some time in their journey
	var getDelayedTrains = function (callback) {
		transportapi.getLiveArrivals(_stationCode, function (err, results) {
			// TODO: what should I do about cancelled trains here?
			callback(err, _.filter(results.arrivals.all, function (arrival) {
				return (
					(arrival.status === 'LATE') || 
					_.contains(_.keys(delayedTrains), arrival.train_uid)
				);
			}));
		});
	}

	// adds arrivedServices to the current CSV of arrived services that 
	// were late at some point in their journey
	var saveArrivedTrains = function (arrivedTrains, callback) {

		var currentDate = new Date(),
			filename = currentDate.getFullYear() + (currentDate.getMonth() < 9 ? '0' : '') + (currentDate.getMonth() + 1) + (currentDate.getDate() < 10 ? '0' : '') + currentDate.getDate() + '_' + _stationCode.toLowerCase() + '.csv';

		function load(callback) {
			fs.exists(path.join(_dataFolder, filename), function (exists) {
				if (!exists) {
					callback (null, { });
				} else {
					csv()
						.from.path(path.join(_dataFolder, filename), {
							columns: true
						})
						.to.array(function (previouslyArrivedTrains) { 
							callback(null, previouslyArrivedTrains);
						});
				}
			});
		}

		function save(arrivedTrains, callback) {
			if (_.keys(arrivedTrains).length === 0) {
				callback(null);
			} else {
				csv()
					.from.array(_.values(arrivedTrains))
					.to.stream(fs.createWriteStream(path.join(_dataFolder, filename)), {
							header: true,
							columns: _.keys(_.values(arrivedTrains)[0]),
						})
					.on('close', function (count) {
						callback(null);
					});
			}
		}

		load(function (err, previouslyArrivedTrains) {
			save(_.extend(previouslyArrivedTrains, arrivedTrains), callback);
		});
	};

	var cycle = function (callback) {
		// log(_stationCode + ": Checking...");
		var timeStart = new Date();
		getDelayedTrains(function (err, results) {
			// ### DEBUG ONLY
			fs.writeFileSync(path.join(_dataFolder, _stationCode + '_debug.json'), JSON.stringify(results));
			log(_stationCode + ": There are currently " + results.length + " live delayed trains (" + _.map(results, function (result) { return result.train_uid; }).join(", ") + ").");
			// I identify all services that I was monitoring and have arrived 
			var arrivedTrains = _.reduce(_.difference(_.keys(delayedTrains), _.map(results, function (result) { return result.train_uid; })), function (memo, arrivedTrainKey) {
				memo[arrivedTrainKey] = delayedTrains[arrivedTrainKey];
				return memo;
			}, { });
			if (_.keys(arrivedTrains).length > 0) log(_stationCode + ": " + _.keys(arrivedTrains).length + " monitored services have arrived (" + _.keys(arrivedTrains).join(", ") + ").");
			// I save arrived services to disk
			saveArrivedTrains(arrivedTrains, function (err) {
				// I remove arrived services from memory
				_.each(_.keys(arrivedTrains), function (arrivedTrainKey) {
					delete delayedTrains[arrivedTrainKey];
				});
				// and I update the ones that are still going
				_.each(results, function (delayedTrain) {
					delayedTrains[delayedTrain.train_uid] = delayedTrain;
				});
				// log(_stationCode + ": Finished checking.");
				setTimeout(cycle, Math.max(0, POLL_FREQUENCY * 1000 - ((new Date()) - timeStart)));
			});
		});
	};

	cycle();
	return { };

}