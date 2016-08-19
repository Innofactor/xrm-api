var Serializer = require("serializer.js");

var Message = function (util) {

	var serializer = new Serializer();

	this.RetrieveMultiple = function (options) {
		var template = `
			<s:Body>
				<RetrieveMultiple xmlns="http://schemas.microsoft.com/xrm/2011/Contracts/Services">
					<query 
						i:type="b:QueryExpression"
						xmlns:b="http://schemas.microsoft.com/xrm/2011/Contracts"
						xmlns:i="http://www.w3.org/2001/XMLSchema-instance"
						xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
						{requetbody}
					</query>
				</RetrieveMultiple>
			</s:Body>`;

		var body = serializer.toXmlRetrieveMultiple(options);

        return util.executePostPromised(options, "RetrieveMultiple", template, body);
    };

	this.Retrieve = function(options) {
		var template = `
			<s:Body>
				<Retrieve xmlns="http://schemas.microsoft.com/xrm/2011/Contracts/Services"  xmlns:b="http://schemas.microsoft.com/xrm/2011/Contracts" xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
			{requetbody}
				</Retrieve>
			</s:Body>`;
		
		var body = serializer.toXmlRetrieve(options);

		return util.executePostPromised(options, "Retrieve", template, body);
	}

	this.Create = function (options) {
		var template = `
		<s:Body>
   <Create xmlns="http://schemas.microsoft.com/xrm/2011/Contracts/Services"  xmlns:b="http://schemas.microsoft.com/xrm/2011/Contracts" xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:c="http://schemas.datacontract.org/2004/07/System.Collections.Generic">
      <entity>
         {requetbody}
      </entity>
   </Create>
</s:Body>`;

		var body = serializer.toXmlCreateUpdate(options);

        return util.executePostPromised(options, "Create", template, body);
    };
}

module.exports = Message;