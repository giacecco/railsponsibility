var fs = require('fs'),
    log = require('./utils').log,
    ntwitter = require('ntwitter'),
    path = require('path'),
    twitterClient = null;

var SECRET_FILENAME = path.join(__dirname, "TWITTER_SECRET.json");

var initialise = function (callback) {
    if (twitterClient) {
        callback(null);
    } else {
        var SECRET = JSON.parse(fs.readFileSync(SECRET_FILENAME));
        twitterClient = new ntwitter({
                consumer_key: SECRET.api_key,
                consumer_secret: SECRET.api_secret,
                access_token_key: SECRET.access_token,
                access_token_secret: SECRET.access_token_secret 
            });
        callback(null);
    }
}

exports.listen = function (callback) {
    initialise(function (err) {
        log("twitter: initialising listening for messages to @railspo...");
        twitterClient.stream('statuses/filter', { track: [ "@railspo" ] }, function (stream) {
            stream.on('error', function(error, code) {
                log("twitter: error listening: " + error + ", " + code);
            }),
            stream.on('data', function (data) { 
                callback(null, data ? { from: data.user.screen_name, created_at: new Date(data.created_at), message: data.text } : null);
            });
        });
    });
}

exports.updateStatus = function (status, callback) {
    initialise(function (err) {
        twitterClient.updateStatus(status, callback || function (err) { if (err) utils.log("twitter: error posting, " + JSON.stringify(err)); });
    });
}