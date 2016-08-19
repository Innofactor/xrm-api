var Serializer = require("serializer.js");

var Message = function (util) {
	
	this.Auth = util;

	this.Retrieve = function(options) {
		var template = `
			<s:Body>
				<Retrieve xmlns="http://schemas.microsoft.com/xrm/2011/Contracts/Services"  xmlns:b="http://schemas.microsoft.com/xrm/2011/Contracts" xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
			{requetbody}
				</Retrieve>
			</s:Body>`;

		return util.executePostPromised(options, "Retrieve", template, new Serializer().toXmlRetrieve(options));
	}
}

module.exports = Message;