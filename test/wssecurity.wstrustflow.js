/*global describe, before, beforeEach, it */

var assert = require('assert');
var fs = require('fs');
var WSTrustFlow = require('../lib/ws-security/wsTrustFlow.js');


describe('wssecurity.wstrustflow', function () {
    "use strict";

    it('Should perform wstrust flow', function (done) {
        var flow = new WSTrustFlow({
            wstrustEndpoint: 'https://sts1.innovecsonline.co.za/adfs/services/trust/2005/usernamemixed',
            username: 'test@3ddesign.co.za',
            password: 'P@ssw0rd',
            appliesTo: 'https://temp.innovecsonline.co.za/XRMServices/2011/Organization.svc',
            useClientEntropy: true,
            keyType: 'http://schemas.xmlsoap.org/ws/2005/02/trust/SymmetricKey',
            keySize: 256
        });

        flow.getWSSecurityHeader(function (err, header) {
            assert.ifError(err);
            assert.ok(header);
            done();
        });

    });

    it('Should perform wstrust flow twice', function (done) {
        var flow = new WSTrustFlow({ wstrustEndpoint: 'https://sts1.innovecsonline.co.za/adfs/services/trust/2005/usernamemixed',
            username: 'test@3ddesign.co.za',
            password: 'P@ssw0rd',
            appliesTo: 'https://temp.innovecsonline.co.za/XRMServices/2011/Organization.svc',
            useClientEntropy: true,
            keyType: 'http://schemas.xmlsoap.org/ws/2005/02/trust/SymmetricKey',
            keySize: '256' });

        flow.getWSSecurityHeader(function (err, header) {
            assert.ifError(err);
            assert.ok(header);

            var flow2 = new WSTrustFlow({ wstrustEndpoint: 'https://sts1.innovecsonline.co.za/adfs/services/trust/2005/usernamemixed',
                username: 'test@3ddesign.co.za',
                password: 'P@ssw0rd',
                appliesTo: 'https://temp.innovecsonline.co.za/XRMServices/2011/Organization.svc',
                useClientEntropy: true,
                keyType: 'http://schemas.xmlsoap.org/ws/2005/02/trust/SymmetricKey',
                keySize: '256' });

            flow2.getWSSecurityHeader(function (err, header) {
                assert.ifError(err);
                assert.ok(header);

                done();
            });
        });
    });
});