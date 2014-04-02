var DEFAULT_POLL_FREQUENCY = 1; // minutes

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

	var dateToCSVDate (d) {
		return d.getFullYear() + "/" + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + "/" + (d.getDate() < 10 ? '0' : '') + d.getDate() + " " + (d.getHours() < 10 ? '0' : '') + d.getHours() + ":" + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() + ":" + (d.getSeconds() < 10 ? '0' : '') + d.getSeconds();
	}

	var log = function (s) {
		console.log(dateToCSVDate(new Date()) + " - " + s);
	}

	// returns all trains arriving at the station that are currently live and
	// are or have been delayed some time in their journey
	var getDelayedTrains = function (callback) {
		transportapi.getLiveArrivals(_stationCode, function (err, results) {
			// TODO: what should I do about cancelled trains here?
			// TODO: the script should not crash if results is empty / err is something
			callback(err, _.filter(results, function (arrival) {
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
						})
						.transform(function (row) {
							_.each([ 'aimed_departure_time', 'expected_departure_time', 'aimed_arrival_time', 'expected_arrival_time' ], function (columnName) {
								if (row[columnName] !== "") row[columnName] = new Date(row[columnName]);
							});
  							return row;
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
					})
					.transform(function (row) {
						_.each([ 'aimed_departure_time', 'expected_departure_time', 'aimed_arrival_time', 'expected_arrival_time' ], function (columnName) {
							if (row[columnName]) row[columnName] = dateToCSVDate(row[columnName]);
						});
						return row;
					});
			}
		}

		load(function (err, previouslyArrivedTrains) {
			save(_.extend(previouslyArrivedTrains, arrivedTrains), callback);
		});
	};

	var cycle = function (callback) {
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
				// I schedule the cycle to run again one minute before the 
				// sooner of aimed_arrival_times and expected_arrival_times
				var nextRun = _.map(results, function (arrival) { return arrival.aimed_arrival_time; })
					.concat(_.map(results, function (arrival) { return arrival.expected_arrival_time; }))
					.sort(function (a, b) { return a.valueOf() - b.valueOf(); })[0];
				nextRun.setMinutes(nextRun.getMinutes() - 1);
				nextRun = Math.max(0, (new Date(timeStart.valueOf() + DEFAULT_POLL_FREQUENCY * 60000)) - (new Date()), nextRun - (new Date()));
				log(_stationCode + ": checking again in " + parseInt(nextRun / 1000) + " seconds...");
				setTimeout(cycle, nextRun);
			});
		});
	};

	cycle();
	return { };

}