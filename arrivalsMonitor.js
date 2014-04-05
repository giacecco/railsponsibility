var DEFAULT_POLL_FREQUENCY = 1; // minutes

var csv = require('csv'),
	dateToCSVDate = require('./utils').dateToCSVDate,
	fs = require('fs'),
	log = require('./utils').log,
	path = require('path'),
	transportapi = require('./transportapi_interface'),
	_ = require('underscore');

module.exports = function (stationCode, options) {

	// check the constructor's parameter
	// TODO: check that the stationCode is recognised
	if (!_.isUndefined(options) && !_.isObject(options)) 
		throw new Error('options is specified but is not an object.');
	options = options || { };
	if (!_.isUndefined(options.arrivalCallback) && !_.isFunction(options.arrivalCallback))
		throw new Error('options.arrivalCallback must be a function.')
	options.arrivalCallback = options.arrivalCallback || null;
	if (!_.isUndefined(options.dataFolder) && !fs.existsSync(options.dataFolder)) {
		throw new Error('options.dataFolder must be an existing folder.')
	} else {
		if (!_.isUndefined(options.dataFolder) && !fs.lstatSync(options.dataFolder).isDirectory())
			throw new Error('options.dataFolder must be an existing folder.')
	}
	options.dataFolder = options.dataFolder || null;
	// TODO: do I still need what is described here?
	// note that if delayedOnly is set to true, the monitor monitors not only 
	// the arrival of trains that arrived late but also of trains that were late 
	// anytime in their monitored journey previous to arrival
	if (!_.isUndefined(options.delayedOnly) && !_.isBoolean(options.delayedOnly))
		throw new Error('options.delayedOnly must be either true or false.')
	options.delayedOnly = (options.delayedOnly === true); 
	if (!_.isUndefined(options.duration) && !_.isNumber(options.duration)) 
		throw new Error('options.duration must be a number of minutes.')
	if (options.duration) setTimeout(function () { shutdown(); }, options.duration * 60000);

	var liveArrivalsCache = { },
		_stationCode = stationCode,
		nextCycleTimeout = null;

	var shutdown = function () {
		if (nextCycleTimeout) clearTimeout(nextCycleTimeout);
	}

	// adds arrivedTrains to the current CSV of arrived services that 
	// were late at some point in their journey
	var saveArrivedTrains = function (arrivedTrains, callback) {
		if (!options.dataFolder) {
			callback(null);
		} else {

			var currentDate = new Date(),
				filename = currentDate.getFullYear() + (currentDate.getMonth() < 9 ? '0' : '') + (currentDate.getMonth() + 1) + (currentDate.getDate() < 10 ? '0' : '') + currentDate.getDate() + '_' + _stationCode.toLowerCase() + '.csv';

			function load(callback) {
				fs.exists(path.join(options.dataFolder, filename), function (exists) {
					if (!exists) {
						callback (null, { });
					} else {
						csv()
							.from.path(path.join(options.dataFolder, filename), {
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
					.to.stream(fs.createWriteStream(path.join(options.dataFolder, filename)), {
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

		}
	};

	var cycle = function () {
		var timeStart = new Date();
		transportapi.getLiveArrivals(_stationCode, function (err, liveArrivals) {
			// ### DEBUG ONLY
			fs.writeFileSync(path.join(options.dataFolder, _stationCode + '_arrivals_debug.json'), JSON.stringify(liveArrivals));
			if (err) {
				// I don't need to care too much here, I can cope with 
				// occasionally fails of getDelayedTrains() 
				nextCycleTimeout = setTimeout(cycle, (new Date(timeStart.valueOf() + DEFAULT_POLL_FREQUENCY * 60000)) - (new Date()));
			} else {
				if (options.delayedOnly) liveArrivals = _.filter(liveArrivals, function (arrival) { return _.contains(_.keys(liveArrivalsCache), arrival.train_uid) || arrival.status === 'LATE'; });
				// I identify all services that I was monitoring and have arrived 
				var newlyArrivedTrains = _.reduce(_.difference(_.keys(liveArrivalsCache), _.map(liveArrivals, function (liveArrival) { return liveArrival.train_uid; })), function (memo, arrivedTrainKey) {
					if (options.arrivalCallback) options.arrivalCallback(liveArrivalsCache[arrivedTrainKey]);  
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
					if (nextRun) nextRun.setMinutes(nextRun.getMinutes() - 1);
					nextRun = Math.max(0, (new Date(timeStart.valueOf() + DEFAULT_POLL_FREQUENCY * 60000)) - (new Date()), nextRun - (new Date()));
					log(_stationCode + ": checking again in " + parseInt(nextRun / 1000) + " seconds...");
					nextCycleTimeout = setTimeout(cycle, nextRun);
				});
			}
		});
	};

	cycle();
	return { 
		shutdown: shutdown,
	};

}