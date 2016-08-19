var Serializer = require("../serializer.js");

var template = `
<s:Body>
	<Retrieve xmlns="http://schemas.microsoft.com/xrm/2011/Contracts/Services"  xmlns:b="http://schemas.microsoft.com/xrm/2011/Contracts" xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
{requetbody}
	</Retrieve>
</s:Body>`;

var Call = function (util, options) {
    var body = new Serializer().toXmlRetrieve(options);
    return new Promise(function(fulfill, reject) {
        util.executePost(options, "Retrieve", template, body, function (err, data) {
            if (err) {
                reject(err);
            }
            fulfill(data);
        });
    });
}

module.exports = Call;