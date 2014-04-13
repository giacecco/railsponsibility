var fs = require('fs'),
    Stomp = require('stomp-client'),
    utils = require('./utils'),
	_ = require('underscore');

var SECRET = JSON.parse(fs.readFileSync(path.join(__dirname, 'NROD_SECRET.json'))),
    STATION_CODES = null,
    client = new Stomp('datafeeds.networkrail.co.uk', 61618, SECRET.username, SECRET.password);

/*
client.connect(function (sessionId) {
    client.subscribe('/topic/TRAIN_MVT_ALL_TOC', function (events, headers) {
        events = _.map(JSON.parse(events), function (event) { return event.body; });
        _.each(_.filter(events, function (event) { return event.event_type === 'ARRIVAL'; }), function (event) {
            console.log('****************');
            console.log(event);
        });
    });
});
*/
utils.tiploc2stanox('BERKHMD', function (err, stanox) {
    console.log(stanox);
});