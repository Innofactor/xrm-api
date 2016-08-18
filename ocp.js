var https       = require('https');
var url         = require('url');
var xpath       = require('xpath');
var cookie      = require('cookie');
var Cache       = require("mem-cache");
var uuid        = require("node-uuid");
var domParser   = new (require('xmldom').DOMParser)();
var constants   = require('constants');


var samlTemplate = '\
        <s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing" xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">\
            <s:Header>\
                <a:Action s:mustUnderstand="1">http://schemas.xmlsoap.org/ws/2005/02/trust/RST/Issue</a:Action>\
                <a:ReplyTo>\
                    <a:Address>http://www.w3.org/2005/08/addressing/anonymous</a:Address>\
                </a:ReplyTo>\
                <a:To s:mustUnderstand="1">https://login.microsoftonline.com/extSTS.srf</a:To>\
                <o:Security s:mustUnderstand="1" xmlns:o="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">\
                    <o:UsernameToken>\
                        <o:Username>{username}</o:Username>\
                        <o:Password>{password}</o:Password>\
                    </o:UsernameToken>\
                </o:Security>\
            </s:Header>\
            <s:Body>\
                <t:RequestSecurityToken xmlns:t="http://schemas.xmlsoap.org/ws/2005/02/trust">\
                  <wsp:AppliesTo xmlns:wsp="http://schemas.xmlsoap.org/ws/2004/09/policy">\
                    <a:EndpointReference>\
                      <a:Address>{endpoint}</a:Address>\
                    </a:EndpointReference>\
                  </wsp:AppliesTo>\
                  <t:KeyType>http://schemas.xmlsoap.org/ws/2005/05/identity/NoProofKey</t:KeyType>\
                  <t:RequestType>http://schemas.xmlsoap.org/ws/2005/02/trust/Issue</t:RequestType>\
                  <t:TokenType>urn:oasis:names:tc:SAML:1.0:assertion</t:TokenType>\
                </t:RequestSecurityToken>\
            </s:Body>\
        </s:Envelope>';


// var loginPath       = '/_forms/default.aspx?wa=wsignin1.0';                 // Login path 
// var loginEndpoint   = url.resolve("https://54.196.167.18", loginPath);   // Login URL for the configured host

var loginEndpoint = "urn:crmapac:dynamics.com";

// build full name condition for XPath expression
var name = function(name) {
    return "/*[name(.)='" + name + "']";
};

// does the HTTP POST and returns the authentication token
var getAuthenticationToken = function (username, password, cb) {

    var samlRequest = samlTemplate
        .replace("{username}", username)
        .replace("{password}", password)
        .replace("{endpoint}", loginEndpoint);

    var options = {
        method: 'POST',
        host: 'login.microsoftonline.com',
        path: '/extSTS.srf',
        headers: { 'Content-Length': samlRequest.length }
    };

    var req = https.request(options, function (res) {

        var xml = '';
        res.setEncoding('utf8');
        res.on('data', function (chunk) { xml += chunk; })
        res.on('end', function () {
            // parses XML
            var resXml = domParser.parseFromString(xml); 
            
            // search for a fault
            var exp = ['S:Envelope', 'S:Body', 'S:Fault', 'S:Detail', 'psf:error', 'psf:internalerror', 'psf:text'].map(name).join("") + "/text()";
            var fault = xpath.select(exp, resXml);
            if (fault.length > 0) { 
            	console.log("Error 1");
            	return cb(new Error(fault.toString()));
            }
    
            // get expiration time
            var expires = null;
            var expiresText = null;
            exp = ['S:Envelope', 'S:Body', 'wst:RequestSecurityTokenResponse', 'wst:Lifetime', 'wsu:Expires'].map(name).join("") + "/text()";

            try {
                expiresText = xpath.select(exp, resXml).toString();
                expires = new Date(new Date(expiresText).getTime() - 60 * 1000); // substract a minute from expiration time, to avoid limit conflict.
            } catch (e) {
                console.log ("WARNING: Couldn't parse token's expiration time. Error: " + e + " Text value: " + expiresText);
                console.log ("\tToken's expiration time was set to 15 minutes.");
                exires = new Date(new Date().getTime() + 15 * 60 * 1000);      // by default expires in 15 minutes. 
            }

            // gets auth token
            exp = "//*[local-name()='CipherValue']/text()";
            var token = xpath.select(exp, resXml);

            if (token.length > 0) {
            	return cb(null, { token: token, expires: expires });
            }
            cb(new Error("Invalid empty token was received"));
        })
    });
    
    //console.log(samlRequest);
    req.end(samlRequest);
};


var user = "revathy.s2@919940209976.onmicrosoft.com";
var pass = "password-1";

getAuthenticationToken(user, pass, function (err, token) {
	if (err) {
		console.log("error", err);
	} else {
		console.log("token", token);
	}
});

/*
Microsoft Dyanmics.
 
User id:           revathy.s2@919940209976.onmicrosoft.com
Password:        password-1
url:                   https://919940209976.crm5.dynamics.com/main.aspx
Orgnization ID : https://919940209976.api.crm5.dynamics.com/XRMServices/2011/Organization.svc
Domain.. 919940209976
*/