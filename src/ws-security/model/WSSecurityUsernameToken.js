var fs = require('fs');
var path = require('path');
var uuid = require('uuid');
var template = fs.readFileSync(path.join(__dirname, '/templates/WSSecurityUsernameToken.xml'), 'utf-8');

function WSSecurityUsernameToken(opts) {
	var message = template.replace('{{username}}', opts.username)
					 .replace('{{password}}', opts.password)
					 .replace('{{uid}}', uuid.v4());

	this.toString = function() {
		return message;
	}
}

module.exports = WSSecurityUsernameToken;