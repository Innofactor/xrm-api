var request = require('request');

var soapClient = module.exports;

soapClient.send = function(endpoint, message, cb) {
	var opts = {
		method: 'post',
		uri: endpoint,
		headers: {
			'content-type': 'application/soap+xml; charset=utf-8'
		},
		body: message.toString()
	}

	request(opts, cb);
}