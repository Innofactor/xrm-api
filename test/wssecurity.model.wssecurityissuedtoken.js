var assert = require('assert');
var fs = require('fs');
var WSSecurityIssuedTokenWithSymmetricProofKey = require('../lib/ws-security/model/WSSecurityIssuedTokenWithSymmetricProofKey.js');


describe('wssecurity.issuedtoken', function() {
	
	it('Should perform wstrust flow', function(done) {
		
		var flow = new WSSecurityIssuedTokenWithSymmetricProofKey({
			clientEntropy: 'client',
			serverEntropy: 'server',
			keySize: 256,
			token: 'token',
			keyIdentifier : 'keyIdentifier',
			created: '2014-07-22T20:49:11.101Z',
			expires: '2014-07-22T20:54:11.101Z'
		});

		assert.ok(flow.toString().indexOf('<SignatureValue>QeL23RakzGHLxEFuaBZBc0eDGLs=</SignatureValue>') != -1);
		assert.ok(flow.toString().indexOf('<DigestValue>RnAyn4t0NcSvFXBGtVIK94QuuDo=</DigestValue>') != -1);

		done();
	})
})