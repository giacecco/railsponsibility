var NO_EVENTS_WARNING = 5; // minutes

var csv = require('csv'),
	fs = require('fs'),
	Stomp = require('stomp-client'),
	utils = require('../utils'),
	_ = require('underscore');

var listener = new Stomp('datafeeds.networkrail.co.uk', 61618, process.env.NROD_USERNAME, process.env.NROD_PASSWORD),
	latestEventsTimestamp = null;

var dateToCSVDate = function (d) {
	return d.getFullYear() + "/" + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + "/" + (d.getDate() < 10 ? '0' : '') + d.getDate() + " " + (d.getHours() < 10 ? '0' : '') + d.getHours() + ":" + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() + ":" + (d.getSeconds() < 10 ? '0' : '') + d.getSeconds();
}

setInterval(function () {
	if (latestEventsTimestamp && ((new Date()).getTime() - latestEventsTimestamp.getTime() > NO_EVENTS_WARNING * 60000)) {
		console.log("\n*** WARNING: more than " + NO_EVENTS_WARNING + " minutes without receiving events from the server.");		
	}
}, 60000);

listener.connect(
    // success callback
    function (sessionId) { 
    	var firstMessages = true;
    	console.log("Listener started.");
        listener.subscribe('/topic/TRAIN_MVT_ALL_TOC', function (events, headers) {
        	process.stdout.write('.');
    		latestEventsTimestamp = new Date();
    		events = JSON.parse(events).map(function (e) { return _.extend(e.body, e.header); });
			csv()
				.from.array(events)
				.to.stream(fs.createWriteStream('foo.csv', { 'flags': firstMessages ? 'w' : 'a', 'encoding': 'utf-8' }), {
					'columns': Object.keys(events[0]),
					'header': firstMessages,
				})
				.transform(function (event) {
					if ((event.event_type !== 'ARRIVAL') || (parseInt(event.actual_timestamp) <= parseInt(event.gbtt_timestamp || event.planned_timestamp))) {
						event = undefined;
					} else {
						[ 'gbtt_timestamp', 'planned_timestamp', 'actual_timestamp', 'msg_queue_timestamp' ].forEach(function (propertyName) {
							if (event[propertyName]) event[propertyName] = dateToCSVDate(new Date(parseInt(event[propertyName]))); 
						});
					}
					return event;
				})
				.on('close', function(count){
					firstMessages = false;
					fs.createWriteStream('foo.csv', { 'flags': 'a', 'encoding': 'utf-8' }).write('\n');
				})
        }); 
    },
    // error callback
    // TODO: perhaps I could make this more resilient rather than just exiting
    function (err) { throw err; }
);        
