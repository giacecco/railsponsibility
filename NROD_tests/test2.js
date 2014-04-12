var fs = require('fs'),
	request = require('request'),
	zlib = require("zlib");

request({ 
	'url': 'https://datafeeds.networkrail.co.uk/ntrod/CifFileAuthenticate', 
	'headers': {
		'Authorization': 'Basic ' + (new Buffer('giacecco@dico.im:Rneth0ven_').toString('base64')),
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
