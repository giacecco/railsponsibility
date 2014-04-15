/* ************************************************************************** *
   This is a scraper for http://www.railwaycodes.org.uk/CRS/CRS0.shtm until
   I find a more authoritative source. Licensing for the data at the above
   url is being assessed. 
 * ************************************************************************** */ 

var argv = require("optimist")
		.usage("Usage: $0 --out <output filename>")
		.demand([ 'out' ])
		.alias('out', 'o')
		.argv,
	async = require('async'),
	cheerio = require('cheerio'),
	csv = require('csv'),
	fs = require('fs'),
	request = require('request'),
	_ = require('underscore'),
	_str = require('underscore.string');
_.mixin(_str.exports());

function getLetters (callback) {
	request('http://www.railwaycodes.org.uk/CRS/CRS0.shtm', function (err, response, body) {
		if (err) throw err;
		var $ = cheerio.load(body),
			letters = [ ];
		$('body p:nth-child(19) a').each(function (index, element) {
			letters.push({
				letter: $(this).text().toLowerCase(),
				url: 'http://www.railwaycodes.org.uk/CRS/' + $(this).attr('href'),
			});
		});
		callback(err, letters);
	});
}

getLetters(function (err, letters) {
	async.reduce(letters, [ ], function (memo, letter, callback) {
		request(letter.url, function (err, response, body) {
			if (err) {
				console.log("Letter " + letter + " is missing or some other kind of error.");
				callback(null, memo);
			} else {
				var $ = cheerio.load(body);
				$('body table tr:nth-child(n+3)').each(function (index, element) {
					memo.push({
						'location': _.trim($('td:nth-child(1)', this).text()) || null,
						'crs': _.trim($('td:nth-child(2)', this).text()) || null,
						'nlc': _.trim($('td:nth-child(3)', this).text()) || null,
						'tiploc': _.trim($('td:nth-child(4)', this).text()) || null,
						'stanox': $('td:nth-child(5)', this).text().match(/\d+/) ? $('td:nth-child(5)', this).text().match(/\d+/)[0] : null,
					});
					// TODO: make the code below work for all 5 columns
					// if the CRS cell is a rowspan, I make the cell normal and
					// duplicate the values
					for(var columnNo = 1; columnNo <= 5; columnNo++) {
						if ($('td:nth-child(' + columnNo + ')', this).attr('rowspan')) {
						    var valueToDuplicate = $('td:nth-child(' + columnNo + ')', this).text(),
						        noOfRows = $('td:nth-child(' + columnNo + ')', this).attr('rowspan');
						    $('td:nth-child(' + columnNo + ')', this).removeAttr('rowspan');
						    $('td:nth-child(' + columnNo + ')', this).parent().nextAll('tr').each(function (index, element) {
						        // if (index < noOfRows - 1) $(this).find('td').eq(0).after('<td>' + valueToDuplicate + '</td>');
						        if (index < noOfRows - 1) $(this).find('td:nth-child(' + columnNo + ')').eq(0).before('<td>' + valueToDuplicate + '</td>');
						    });
						}
					}
				});
				callback(null, memo);
			}
		});
	}, function (err, results) {
		csv()
			.from.array(results)
			.to.stream(fs.createWriteStream(argv.out), {
					header: true,
					columns: _.keys(results[0] || [ ]),
				})
			.on('close', function (count) {
				// nothing to do here
			})
			.on('error', function (err) {
				log(err.message);
			});
	});
});
