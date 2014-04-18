var AsyncCache = require('async-cache'),
	utils = require('./utils');

var STATION_CODES_CONVERSION_CACHE_SIZE = 100, // TODO: does this number make sense?
	STATION_CODES = null;

module.exports = function (options) {

	var nano = require('nano')(options.couchdb || 'http://localhost:5984');

	var stationCodesInitialiseCached = new AsyncCache({ 
		'maxAge': 24 * 60 * 60000, // 1 day 
		'load': function (key, callback) {
				var db = nano.use("railwaycodes_org_uk");
				db.list(function (err, list) {
					db.fetch({ 'keys': list.rows.map(function (r) { return r.key; }) }, function (err, results) {
						if (err) log("utils: error accessing the codes database.");
						STATION_CODES = results.rows.map(function (r) { return r.doc; });
						callback(null);
					});
				});
			}
	});

	var stationCodesInitialise = function (callback) {
		stationCodesInitialiseCached.get(null, callback);
	}

	var crs2tiplocCached = new AsyncCache({
		'max': STATION_CODES_CONVERSION_CACHE_SIZE, 
		'load': function (key, callback) {
			stationCodesInitialise(function (err) {
				callback(null, STATION_CODES.reduce(function (memo, sc) {
					if (sc.crs === key) memo.push(sc.tiploc);
					return memo;
				}, [ ]).sort());
			});
		}
	});

	var crs2tiploc = function (crs, callback) {
		crs2tiplocCached.get(crs.toUpperCase(), callback);
	};

	var tiploc2crsCached = new AsyncCache({
		'max': STATION_CODES_CONVERSION_CACHE_SIZE, 
		'load': function (key, callback) {
			stationCodesInitialise(function (err) {
				callback(null, (STATION_CODES.filter(function (sc) {
					return sc.tiploc === key;
				})[0] || { 'crs': undefined }).crs);
			});
		}
	});

	var tiploc2crs = function (tiploc, callback) {
		tiploc2crsCached.get(tiploc.toUpperCase(), callback);
	};

	var tiploc2stanoxCached = new AsyncCache({
		'max': STATION_CODES_CONVERSION_CACHE_SIZE, 
		'load': function (key, callback) {
			stationCodesInitialise(function (err) {
				var station = STATION_CODES.filter(function (sc) {
					return sc.tiploc === key;
				})[0];
				callback(null, station ? station.stanox : null);
			});
		}
	});

	var tiploc2stanox = function (tiploc, callback) {
		tiploc2stanoxCached.get(tiploc.toUpperCase(), callback);
	};

	var stanox2tiplocCached = new AsyncCache({
		'max': STATION_CODES_CONVERSION_CACHE_SIZE, 
		'load': function (key, callback) {
			stationCodesInitialise(function (err) {
				var station = STATION_CODES.filter(function (sc) {
					return sc.stanox === key;
				})[0];
				callback(null, station ? station.tiploc : null);
			});
		}
	});

	var stanox2tiploc = function (stanox, callback) {
		stanox2tiplocCached.get('' + stanox, callback);
	};

	return {
		'crs2tiploc': crs2tiploc,
		'tiploc2crs': tiploc2crs,
		'tiploc2stanox': tiploc2stanox,
		'stanox2tiploc': stanox2tiploc,
	};

}