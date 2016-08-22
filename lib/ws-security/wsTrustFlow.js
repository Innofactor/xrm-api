var SoapMessage = require('./model/soapMessage');
var SoapMessage = require('./model/soapMessage');
var WSSecurityUsernameToken = require('./model/WSSecurityUsernameToken');
var WSSecurityIssuedTokenWithSymmetricProofKey = require('./model/WSSecurityIssuedTokenWithSymmetricProofKey');

var RequestSecurityToken = require('./model/RequestSecurityToken');
var RequestSecurityTokenResponse = require('./model/RequestSecurityTokenResponse');
var soapClient = require('./soapClient');

var crypto = require('crypto');


function WSTrustFlow(opts) {
	var self = this;

	this.getWSSecurityHeader = function(cb) {

		if (opts.useClientEntropy) {
			opts.clientEntropy = getRandomKey();
		};

		requestSecurityToken(opts, function(err, rstr){
			if (err) {
				cb(err);
				return;
			}

			var header;

			try {
				header = new WSSecurityIssuedTokenWithSymmetricProofKey ({
					clientEntropy: opts.clientEntropy,
					keySize: opts.keySize,

					created: rstr.created,
					expires: rstr.expires,
					serverEntropy: rstr.serverEntropy,
					token: rstr.token,
					keyIdentifier: rstr.keyIdentifier
				});
			}
			catch (e) {
				cb(e);
				return;
			}

			cb(null, header.toString());
		});
	}

	function requestSecurityToken (opts, cb) {
		var message = null;

		try {
			message  = new SoapMessage ({
				action: 'http://schemas.xmlsoap.org/ws/2005/02/trust/RST/Issue',
				endpoint: opts.wstrustEndpoint,
				security: new WSSecurityUsernameToken({
					username: opts.username,
					password: opts.password
				}),
				body: new RequestSecurityToken({
					appliesTo: opts.appliesTo,
					clientEntropy: opts.clientEntropy,
					keyType: opts.keyType,
					keySize: opts.keySize
				})
			});
		}
		catch (e) {
			cb(e);
			return;
		}

		soapClient.send(opts.wstrustEndpoint, message, function(err, res) {
			if (err) {
				cb(new Error('An error ocurred trying to obtain the token: "' + err + '"'));
				return;
			}

			if (res.statusCode != 200) {
				cb(new Error('An error ocurred trying to obtain the token: "' + err + '"'));
				return;
			}

			var rstr = RequestSecurityTokenResponse.parse(res.body);
			cb(null, rstr);
		});
	}
}

function getRandomKey() {
	var length = 1024;
	var set = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz!@#$%^&*()<>?/[]{},.:;';
	var key = '';

	for(var i=0; i < length; i++) {
		key += set.charAt(Math.floor(Math.random() * set.length));
	}

	return crypto.createHash('sha256').update(key).digest('base64')
}

module.exports = WSTrustFlow;
