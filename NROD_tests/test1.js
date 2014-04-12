var Stomp = require('stomp-client'),
	destination = '/topic/TRAIN_MVT_ALL_TOC',
	// ongoing registration as giacecco@dico.im
	client = new Stomp('datafeeds.networkrail.co.uk', 61618, 'giacecco@giacec.co', 'Rneth0ven_'),
	_ = require('underscore');

client.connect(function (sessionId) {
    client.subscribe(destination, function (events, headers) {
    	events = _.map(JSON.parse(events), function (event) { return event.body; });
    	_.each(_.filter(events, function (event) { return event.event_type === 'ARRIVAL'; }), function (event) {
    		console.log('****************');
    		console.log(event);
    	});
    });
});