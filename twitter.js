var ntwitter = require('ntwitter'),
    utils = require('./utils');

module.exports = function (options) {

    var twitterClient = null;;

    var initialise = function (callback) {
        if (twitterClient) {
            callback(null);
        } else {
            twitterClient = new ntwitter({
                    consumer_key: process.env.TWITTER_API_KEY,
                    consumer_secret: process.env.TWITTER_API_SECRET,
                    access_token_key: process.env.TWITTER_ACCESS_TOKEN,
                    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET 
                });
            callback(null);
        }
    }

    var listen = function (callback) {
        initialise(function (err) {
            utils.log("twitter: initialising listening for messages to @railspo...");
            twitterClient.stream('statuses/filter', { track: [ "@railspo" ] }, function (stream) {
                stream.on('error', function(error, code) {
                    utils.log("twitter: error listening: " + error + ", " + code);
                }),
                stream.on('data', function (data) { 
                    callback(null, data ? { from: data.user.screen_name, created_at: new Date(data.created_at), message: data.text } : null);
                });
            });
        });
    }

    var updateStatus = function (status, callback) {
        initialise(function (err) {
            twitterClient.updateStatus(status, callback || function (err) { if (err) utils.log("twitter: error posting, " + JSON.stringify(err)); });
        });
    }

    return {
        'listen': listen,
        'updateStatus': updateStatus,
    };

};