var xmldom = require('xmldom');
var domParser   = new xmldom.DOMParser();
var serializer =  new xmldom.XMLSerializer();

var RequestSecurityTokenResponse = module.exports;

RequestSecurityTokenResponse.parse = function (str) {

	var rstr = {};

	var doc = domParser.parseFromString(str);
	rstr.serverEntropy = tryGet(doc, 'http://schemas.xmlsoap.org/ws/2005/02/trust', 'BinarySecret');
	rstr.tokenType = tryGet(doc,'http://schemas.xmlsoap.org/ws/2005/02/trust', 'TokenType');
	rstr.created = tryGet(doc,'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd', 'Created');
	rstr.expires = tryGet(doc,'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd', 'Expires');
	rstr.keyIdentifier = tryGet(doc,'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd', 'KeyIdentifier');
	
	var tokenNodes = doc.getElementsByTagNameNS('http://schemas.xmlsoap.org/ws/2005/02/trust', 'RequestedSecurityToken');

	if (tokenNodes.length > 0) {
		rstr.token = serializer.serializeToString(tokenNodes[0].firstChild);
	};

	return rstr;
}

function tryGet(doc, namespace, tag) {
	var nodes = doc.getElementsByTagNameNS(namespace, tag);

	if (nodes.length > 0) {
		return (nodes[0].firstChild || '').toString();
	}

	return null;
}