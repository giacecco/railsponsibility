var DEFAULT_POLL_FREQUENCY = 1; // minutes

var csv = require('csv'),
	fs = require('fs'),
	path = require('path'),
	transportapi = require('./transportapi_interface'),
	_ = require('underscore');

module.exports = function (stationCode, dataFolder) {

	var liveArrivalsCache = { },
		_stationCode = stationCode,
		_dataFolder = dataFolder,
		_arrivalCallbackFunction = null,
		_markedForDeletion = false;

	var onArrival = function (arrivalCallbackFunction) {
		_arrivalCallbackFunction = arrivalCallbackFunction;	
	}

	var shutdown = function () {
		_markedForDeletion = true;
	}

	var dateToCSVDate = function (d) {
		return d.getFullYear() + "/" + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + "/" + (d.getDate() < 10 ? '0' : '') + d.getDate() + " " + (d.getHours() < 10 ? '0' : '') + d.getHours() + ":" + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() + ":" + (d.getSeconds() < 10 ? '0' : '') + d.getSeconds();
	}

	var log = function (s) {
		console.log(dateToCSVDate(new Date()) + " - " + s);
	}

	// adds arrivedTrains to the current CSV of arrived services that 
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
							callback(null, _.reduce(previouslyArrivedTrains, function (memo, arrival) {
								memo[arrival.train_uid] = arrival;
								return memo;
							}, { }));
						})
						.transform(function (row) {
							_.each([ 'aimed_departure_time', 'expected_departure_time', 'aimed_arrival_time', 'expected_arrival_time' ], function (columnName) {
								row[columnName] = (row[columnName] === "") ? null : new Date(row[columnName]);
							});
  							return row;
						})
						.on('error', function (err) {
  							log(err.message);
						});
				}
			});
		}

		function save(arrivedTrains, callback) {
			csv()
				.from.array(_.values(arrivedTrains))
				.to.stream(fs.createWriteStream(path.join(_dataFolder, filename)), {
						header: true,
						columns: _.keys(_.values(arrivedTrains)[0]),
					})
				.transform(function (row) {
					_.each([ 'aimed_departure_time', 'expected_departure_time', 'aimed_arrival_time', 'expected_arrival_time' ], function (columnName) {
						if (row[columnName]) row[columnName] = dateToCSVDate(row[columnName]);
					});
					return row;
				})
				.on('close', function (count) {
					callback(null);
				})
				.on('error', function (err) {
					log(err.message);
				});
		}

		if (_.keys(arrivedTrains).length === 0) {
			callback(null);			
		} else {
			load(function (err, previouslyArrivedTrains) {
				save(_.extend(previouslyArrivedTrains, arrivedTrains), callback);
			});
		}
	};

	var cycle = function () {
		if (!_markedForDeletion) {
			var timeStart = new Date();
			transportapi.getLiveArrivals(_stationCode, function (err, liveArrivals) {
				if (err) {
					// I don't need to care too much here, I can cope with 
					// occasionally fails of getDelayedTrains() 
					setTimeout(cycle, (new Date(timeStart.valueOf() + DEFAULT_POLL_FREQUENCY * 60000)) - (new Date()));
				} else {
					// ### DEBUG ONLY
					fs.writeFileSync(path.join(_dataFolder, _stationCode + '_arrivals_debug.json'), JSON.stringify(liveArrivals));
					// I identify all services that I was monitoring and have arrived 
					var newlyArrivedTrains = _.reduce(_.difference(_.keys(liveArrivalsCache), _.map(liveArrivals, function (liveArrival) { return liveArrival.train_uid; })), function (memo, arrivedTrainKey) {
						if (_arrivalCallbackFunction) _arrivalCallbackFunction(liveArrivalsCache[arrivedTrainKey]);  
						memo[arrivedTrainKey] = liveArrivalsCache[arrivedTrainKey];
						return memo;
					}, { });
					// I save newly arrived services to disk (if any)
					saveArrivedTrains(newlyArrivedTrains, function (err) {
						// I remove newly arrived services from memory
						_.each(_.keys(newlyArrivedTrains), function (arrivedTrainKey) {
							delete liveArrivalsCache[arrivedTrainKey];
						});
						// and I update the ones that are still going
						_.each(liveArrivals, function (liveArrival) {
							liveArrivalsCache[liveArrival.train_uid] = liveArrival;
						});
						// I schedule the cycle to run again one minute before the 
						// sooner of aimed_arrival_times and expected_arrival_times
						// Note: some arriving trains can have null arrival times, 
						// this is odd!
						var nextRun = _.reduce(_.values(liveArrivalsCache), function (memo, arrival) {
							return arrival.aimed_arrival_time ? memo.concat(arrival.aimed_arrival_time) : memo;
						}, [ ]).concat(_.reduce(_.values(liveArrivalsCache), function (memo, arrival) {
							return arrival.expected_arrival_time ? memo.concat(arrival.expected_arrival_time) : memo;
						}, [ ])).sort(function (a, b) { return a.valueOf() - b.valueOf(); })[0];
						nextRun.setMinutes(nextRun.getMinutes() - 1);
						nextRun = Math.max(0, (new Date(timeStart.valueOf() + DEFAULT_POLL_FREQUENCY * 60000)) - (new Date()), nextRun - (new Date()));
						log(_stationCode + ": checking again in " + parseInt(nextRun / 1000) + " seconds...");
						setTimeout(cycle, nextRun);
					});
				}
			});
		}
	};

	cycle();
	return { 
		onArrival: onArrival,
		shutdown: shutdown,
	};

}