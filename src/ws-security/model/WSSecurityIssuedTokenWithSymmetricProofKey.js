var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var uuid = require('uuid');

var template = fs.readFileSync(path.join(__dirname, '/templates/WSSecurityIssuedTokenWithSymmetricProofKey.xml'), 'utf-8');

function WSSecurityIssuedTokenWithSymmetricProofKey(opts) {

	var signingKey = calculatePSHA1(opts.clientEntropy, opts.serverEntropy, opts.keySize);
	var securityToken = opts.token
	var keyIdentifier = opts.keyIdentifier;
	var created = opts.created;
	var expires = opts.expires;

	var timestamp = '<u:Timestamp xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd" u:Id="_0"><u:Created>' + created + '</u:Created><u:Expires>' + expires + '</u:Expires></u:Timestamp>';
	var shasum = crypto.createHash('sha1');
	shasum.update(timestamp);
	var digestValue = shasum.digest('base64');

	var signedInfo  = '<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></CanonicalizationMethod><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#hmac-sha1"></SignatureMethod><Reference URI="#_0"><Transforms><Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></Transform></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod><DigestValue>' + digestValue + '</DigestValue></Reference></SignedInfo>';
	var signatureValue = crypto.createHmac('sha1', new Buffer(signingKey, 'base64')).update(signedInfo).digest('base64');

	var message = template.replace('{{timestamp}}', timestamp)
	.replace('{{token}}', securityToken)
	.replace('{{signedinfo}}', signedInfo)
	.replace('{{signatureValue}}', signatureValue)
	.replace('{{keyIdentifer}}', keyIdentifier);

	this.toString = function() {
		return message;
	}

	function calculatePSHA1(clientKey, serverKey, keySize) {

		var clientBytes = new Buffer(clientKey, 'base64');
		var serverBytes = new Buffer(serverKey, 'base64');

		var sizeBytes = keySize / 8;
		var sha1DigestSizeBytes = 160 / 8; 

		var buffer1 = serverBytes;
		var buffer2 = new Buffer(sha1DigestSizeBytes + serverBytes.length);
		var pshaBuffer = new Buffer(sizeBytes)

		var i = 0;

		var temp = null;

		while (i < sizeBytes) {
			buffer1 = new Buffer(crypto.createHmac('sha1', clientBytes)
				.update(buffer1).digest(), 'binary');

			buffer1.copy(buffer2);
			serverBytes.copy(buffer2, sha1DigestSizeBytes);

			temp = new Buffer(crypto.createHmac('sha1', clientBytes)
				.update(buffer2).digest(), 'binary');

			for (var x = 0; x < temp.length; x++) {
				if (i < sizeBytes) {
					pshaBuffer[i] = temp[x];
					i++;
				} else {
					break;
				}
			};
		}

		return pshaBuffer.toString('base64');
	}
}

module.exports = WSSecurityIssuedTokenWithSymmetricProofKey;