var assert = require('assert');
var fs = require('fs');
var RequestSecurityTokenResponse = require('../lib/ws-security/model/RequestSecurityTokenResponse');

var rstXml = fs.readFileSync(__dirname + '/assets/rstr.xml', 'utf-8');

describe('wssecurity.model.requestSecurityTokenResponse', function() {
	
	it('Should parse rstr xml.', function(done) {
		this.timeout(100000);

		var parsed = RequestSecurityTokenResponse.parse(rstXml);

		assert.equal('07lcwULGQtV3vgn/gm06yZv1JhCBFBqEfd8C2NcHz7o=', parsed.serverEntropy);
		assert.equal('urn:oasis:names:tc:SAML:1.0:assertion', parsed.tokenType);
		assert.equal('2014-07-17T18:52:02.630Z', parsed.created);
		assert.equal('2014-07-17T18:57:02.630Z', parsed.expires);
		assert.equal('_e5c08c8c-2c35-46cd-8259-6bca34d66991', parsed.keyIdentifier);
		done();

	});
})