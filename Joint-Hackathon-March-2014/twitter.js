var SECRET_FILENAME = "./TWITTER_API_SECRET.json";

var fs = require("fs"),
    ntwitter = require("ntwitter"),
    util = require("./util"),
    twitterClient;

exports.initialise = function (callback) {
    var SECRET = JSON.parse(fs.readFileSync(SECRET_FILENAME));
    twitterClient = new ntwitter({
            consumer_key: SECRET.api_key,
            consumer_secret: SECRET.api_secret,
            access_token_key: SECRET.access_token,
            access_token_secret: SECRET.access_token_secret 
        });
    callback(null);
}

exports.listen = function (callback) {
    twitterClient.stream('statuses/filter', { track: [ "@railspon" ], language: "en" }, function (stream) {
        stream.on('error', function(error, code) {
            console.log("Error " + error + ": " + code);
        });
        stream.on('data', function (data) { 
            callback(null, data ? { from: data.user.screen_name, created_at: new Date(data.created_at), message: data.text } : null);
        });
    });
}

exports.send = function (status, callback) {
    twitterClient.updateStatus('@giacecco Can you read me?', callback);
}