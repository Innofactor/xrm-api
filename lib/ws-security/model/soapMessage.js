var fs = require('fs');
var path = require('path');
var uuid = require('uuid');

var template = fs.readFileSync(path.join(__dirname, '/templates/soapMessage.xml'), 'utf-8');

function SoapMessage(opts) {
	var message = template;

	var security = typeof(opts.security) == 'string' ? opts.security : opts.security.toString();
	var body = typeof(opts.body) == 'string' ? opts.body : opts.body.toString();

	message = message.replace('{{action}}', opts.action)
					 .replace('{{messageId}}', uuid.v4())
					 .replace('{{to}}', opts.endpoint)
					 .replace('{{security}}', security)
					 .replace('{{body}}', body);

	this.toString = function() {
		return message;
	}
}

module.exports = SoapMessage;