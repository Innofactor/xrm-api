var fs = require('fs');
var path = require('path');
var templateSymmetricWithEntropy = fs.readFileSync(path.join(__dirname, '/templates/requestSecurityToken.symmetricWithEntropy.xml'), 'utf-8');

function RequestSecurityToken(opts) {

	// in the future we must support bearer and asymmetric
	if (opts.keyType != 'http://schemas.xmlsoap.org/ws/2005/02/trust/SymmetricKey') {
		throw new Error('Unsupported keyType: ' + opts.keyType);
	};

	var message = templateSymmetricWithEntropy.replace('{{appliesTo}}', opts.appliesTo)
						  .replace('{{keyType}}', opts.keyType)
						  .replace('{{keySize}}', opts.keySize)
						  .replace('{{clientEntropy}}', opts.clientEntropy);

	this.toString = function() {
		return message;
	}
}

module.exports = RequestSecurityToken;