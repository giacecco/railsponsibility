var SECRET_FILENAME = "./TWITTER_API_SECRET.json",
    STOPWORDS = [ "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves", "what", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing", "would", "should", "could", "ought", "i'm", "you're", "he's", "she's", "it's", "we're", "they're", "i've", "you've", "we've", "they've", "i'd", "you'd", "he'd", "she'd", "we'd", "they'd", "i'll", "you'll", "he'll", "she'll", "we'll", "they'll", "isn't", "aren't", "wasn't", "weren't", "hasn't", "haven't", "hadn't", "doesn't", "don't", "didn't", "won't", "wouldn't", "shan't", "shouldn't", "can't", "cannot", "couldn't", "mustn't", "let's", "that's", "who's", "what's", "here's", "there's", "when's", "where's", "why's", "how's", "a", "an", "the", "and", "but", "if", "or", "because", "as", "until", "while", "of", "at", "by", "for", "with", "about", "against", "between", "into", "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very" ],
    MIN_WORD_LENGTH = 4;

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

exports.listen = function (options, callback) {
    twitterClient.stream('statuses/filter', { track: options.searchStrings, language: "en" }, function (stream) {
        stream.on('error', function(error, code) {
            console.log("Error " + error + ": " + code);
        });
        stream.on('data', function (data) { 
            if (data) {
                var entryDate = new Date(data.created_at),
                    dateString = util.date2Timestamp(entryDate);
                callback(data.text
                    // remove other strange characters with spaces
                    .replace(/[\n\r\t]/g, " ")
                    // remove URLs
                    .replace(/\b(https?|ftp|file):\/\/[\-A-Za-z0-9+&@#\/%?=~_|!:,.;]*[\-A-Za-z0-9+&@#\/%=~_| ]/g, "")
                    // remove Twitter usernames
                    .replace(/(^|[^@\w])@(\w{1,15})\b/g, "")
                    // remove everything but word characters and spaces
                    .replace(/[^\w\s]/g, " ")
                    // remove numbers
                    // TODO: I did this, not sure it is ideal :-D
                    .replace(/\d+([,.]\d*)?([,.]\d*)?/g, " ")
                    // split in the individual words
                    .split(" ")
                    // remove short words
                    .filter(function (word) { return word.length > MIN_WORD_LENGTH; })
                    // make lowercase
                    .map(function (word) { return word.toLowerCase(); })
                    // remove stopwords
                    .filter(function (word) { return STOPWORDS.indexOf(word) === -1; })
                    // passed!
                    .map(function (word) {
                        return { created_at: dateString, word: word };
                }));
            }
        });
    });
}
