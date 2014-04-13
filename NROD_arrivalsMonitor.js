var fs = require('fs'),
    Stomp = require('stomp-client'),
    path = require('path'),
	_ = require('underscore');

var SECRET = JSON.parse(fs.readFileSync(path.join(__dirname, 'NROD_SECRET.json'))),
    STATION_CODES = null,
    client = new Stomp('datafeeds.networkrail.co.uk', 61618, SECRET.username, SECRET.password);

function initialise (callback) {
    if (STATION_CODES) return callback(null); 
    csv()
        .from.path(path.join(__dirname, "railwaycodes_org_uk.csv"), {
            columns: true
        })  
        .to.array(function (stationCodes) {
            STATION_CODES = stationCodes;
            callback(null);
        });
}

initialise(function (err) {
    client.connect(function (sessionId) {
        client.subscribe('/topic/TRAIN_MVT_ALL_TOC', function (events, headers) {
            events = _.map(JSON.parse(events), function (event) { return event.body; });
            _.each(_.filter(events, function (event) { return event.event_type === 'ARRIVAL'; }), function (event) {
                console.log('****************');
                console.log(event);
            });
        });
    });
});
