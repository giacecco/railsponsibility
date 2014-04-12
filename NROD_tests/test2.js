var fs = require('fs'),
	request = require('request'),
	zlib = require("zlib"),
	SECRET = JSON.parse(fs.readFileSync('../NROD_SECRET.json'));

request({ 
	'url': 'https://datafeeds.networkrail.co.uk/ntrod/CifFileAuthenticate', 
	'headers': {
		'Authorization': 'Basic ' + (new Buffer(SECRET.username + ':' + SECRET.password).toString('base64')),
	},
	'qs': {
		'type': 'CIF_ALL_FULL_DAILY',
		'day': 'toc-full',
	},
	'followRedirect': true,
	'followAllRedirects': true,
	/*
	'auth': { 
		'user': 'giacecco@dico.im',
		'password': 'Rneth0ven_',
		'sendImmediately': true,
	},
	*/
})
	// .pipe(zlib.createGunzip())
	.pipe(fs.createWriteStream('file.txt'));
