var DEFAULT_POLL_FREQUENCY = 1, // minutes
	ADVANCE_MONITOR_AWAKENING = 1; // minutes

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
	if (!_.isUndefined(options.dataFolder) && !fs.existsSync(options.dataFolder)) 
		throw new Error('options.dataFolder must be an existing folder.')
	if (!_.isUndefined(options.dataFolder) && !fs.lstatSync(options.dataFolder).isDirectory())
		throw new Error('options.dataFolder must be an existing folder.')
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
	if (!_.isUndefined(options.limitTo) && !_.isArray(options.limitTo)) 
		throw new Error('options.limitTo must be an array.');
	if (!_.isUndefined(options.limitTo) && !_.every(options.limitTo, function (l) {
		return _.isString(l.service) && _.isDate(l.aimedArrivalTime);
	})) throw new Error('options.limitTo must be an array of { service, aimedArrivalTime }.');
	options.limitTo = options.limitTo || null;
	if (options.limitTo) {
		options.limitTo = _.reduce(options.limitTo, function (memo, l) { 
			memo[l.service + '_' + l.aimedArrivalTime.getTime()] = l;
			return memo;
		}, { });
		options.delayedOnly = false;
	}

	var liveArrivalsCache = { },
		_stationCode = stationCode,
		nextCycleTimeout = null,
		markedForShutdown = false;

	var limitTo = function (service, aimedArrivalTime) {
		options.delayedOnly = false;
		if (!options.limitTo) options.limitTo = { };
		options.limitTo[service + '_' + aimedArrivalTime.getTime()] = { 'service': service, 'aimedArrivalTime': aimedArrivalTime };
		// adding one train to be monitored required all previous assumptions
		// on how long the monitor can sleep null
		if (nextCycleTimeout) clearTimeout(nextCycleTimeout);
		scheduleNextAwakening(new Date(0));
	}

	var shutdown = function () {
		markedForShutdown = true;
		if (nextCycleTimeout) clearTimeout(nextCycleTimeout);
	}

	// I calculate how many milliseconds from now to when the cycle must run 
	// again and schedule that
	var scheduleNextAwakening = function (timeStart) {
		if (!markedForShutdown && (_.isNull(options.limitTo) || (_.keys(options.limitTo).length > 0))) {
			var nextRun = _.reduce(_.values(liveArrivalsCache), function (memo, arrival) {
				return arrival.aimed_arrival_time ? memo.concat(arrival.aimed_arrival_time) : memo;
			}, [ ]).concat(_.reduce(_.values(liveArrivalsCache), function (memo, arrival) {
				return arrival.expected_arrival_time ? memo.concat(arrival.expected_arrival_time) : memo;
			}, [ ])).concat(!options.limitTo ? [ ] : _.map(_.values(options.limitTo), function (arrival) {
				return arrival.aimedArrivalTime;
			})).sort(function (a, b) { return a.getTime() - b.getTime(); })[0];
			if (!nextRun) {
				nextRun = Math.max(0, DEFAULT_POLL_FREQUENCY * 60000 - ((new Date()) - timeStart));
			} else {
				nextRun.setMinutes(nextRun.getMinutes() - ADVANCE_MONITOR_AWAKENING);
				nextRun = Math.max(0, DEFAULT_POLL_FREQUENCY * 60000 - ((new Date()) - timeStart), nextRun - (new Date()));
			}
			log(_stationCode + ": next check at " + (new Date((new Date()).getTime() + nextRun)) + " ...");
			nextCycleTimeout = setTimeout(cycle, nextRun);
		}
	}

	// adds arrivedTrains to the current CSV of arrived services that 
	// were late at some point in their journey
	var saveArrivedTrains = function (arrivedTrains, callback) {
		if (!options.dataFolder) {
			callback(null);
		} else {

			// note I work on a clone of the original arrivedTrains
			// below, because I will need to transform the data
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
						var rowClone = _.clone(row);
						_.each([ 'aimed_departure_time', 'expected_departure_time', 'aimed_arrival_time', 'expected_arrival_time' ], function (columnName) {
							if (rowClone[columnName]) rowClone[columnName] = dateToCSVDate(rowClone[columnName]);
						});
						return rowClone;
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
		if (!markedForShutdown && (_.isNull(options.limitTo) || (_.keys(options.limitTo).length > 0))) {
			var timeStart = new Date();
			transportapi.getLiveArrivals(_stationCode, function (err, liveArrivals) {
				// ### DEBUG ONLY
				fs.writeFileSync(path.join(options.dataFolder, _stationCode + '_arrivals_debug.json'), JSON.stringify(liveArrivals));
				if (err) {
					// I don't need to care too much here, I can cope with 
					// occasionally fails of getDelayedTrains() 
					nextCycleTimeout = setTimeout(cycle, (new Date(timeStart.getTime() + DEFAULT_POLL_FREQUENCY * 60000)) - (new Date()));
				} else {
					// if I am monitoring delayed trains only, I ignore the ones 
					// that are not delayed and that were not on my 
					// liveArrivalsCache list already because they were late 
					// earlier
					if (options.delayedOnly) liveArrivals = _.filter(liveArrivals, function (arrival) { return _.contains(_.keys(liveArrivalsCache), arrival.train_uid) || arrival.status === 'LATE'; });
					// if I am monitoring a few trains only, I ignore all other 
					// trains
					if (options.limitTo) liveArrivals = _.filter(liveArrivals, function (arrival) {
						return _.contains(_.keys(options.limitTo), arrival.service + '_' + arrival.aimed_arrival_time.getTime());
					});
					// I identify all services that I was monitoring and have arrived 
					var newlyArrivedTrains = _.reduce(_.difference(_.keys(liveArrivalsCache), _.map(liveArrivals, function (liveArrival) { return liveArrival.train_uid; })), function (memo, arrivedTrainKey) {
						memo[arrivedTrainKey] = liveArrivalsCache[arrivedTrainKey];
						return memo;
					}, { });
					// I save newly arrived services to disk (if any)
					saveArrivedTrains(newlyArrivedTrains, function (err) {
						// I trigger events and shutdown if there are no more trains
						// to monitor
						_.each(newlyArrivedTrains, function (arrival) {
							if (options.arrivalCallback) options.arrivalCallback(arrival); 
							delete options.limitTo[arrival.service + '_' + arrival.aimed_arrival_time.getTime()];
						});
						// I remove newly arrived services from memory
						_.each(_.keys(newlyArrivedTrains), function (arrivedTrainKey) {
							delete liveArrivalsCache[arrivedTrainKey];
						});
						// and I update the ones that are still going
						_.each(liveArrivals, function (liveArrival) {
							liveArrivalsCache[liveArrival.train_uid] = liveArrival;
						});
						scheduleNextAwakening(timeStart);
					});
				}
			});
		}
	};

	scheduleNextAwakening(new Date(0));
	return { 
		'limitTo': limitTo,
		'shutdown': shutdown,
	};

}