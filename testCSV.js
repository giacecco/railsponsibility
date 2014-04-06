var csv = require('csv'),
	fs = require('fs');

var data = [ { statement: "this is a" }, 
			 { statement: "this is b" },
			 { statement: "this is c" } ];

csv()
	.from.array(data)
	.to.stream(fs.createWriteStream('foo.csv'), {
			header: true,
			columns: [ 'statement' ],
		})
	.transform(function (row) {
		row.statement += " ... after changing!"; 
		return row;
	})
	.on('close', function (count) {
		console.log(JSON.stringify(data));
	});
