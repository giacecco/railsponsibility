var fs = require('fs'),
    ntwitter = require('ntwitter'),
    path = require('path'),
    twitterClient = null;

var SECRET_FILENAME = path.join(__dirname, "TWITTER_API_SECRET.json");

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
        twitterClient.stream('statuses/filter', { track: [ "@railspon" ] }, function (stream) {
            stream.on('error', function(error, code) {
                console.log("Error " + error + ": " + code);
            }),
            stream.on('data', function (data) { 
                callback(null, data ? { from: data.user.screen_name, created_at: new Date(data.created_at), message: data.text } : null);
            });
        });
    });
}

exports.updateStatus = function (status, callback) {
    initialise(function (err) {
        twitterClient.updateStatus(status, callback || function (err) { });
    });
}