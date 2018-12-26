var Message = function (util) {

	var serializer = new (require("./serializer.js"))();

	this.RetrieveMultiple = function (options) {
		const template = `
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

        return util.executePostPromised(options, "RetrieveMultiple", template, serializer.toXmlRetrieveMultiple(options));
    };

	this.Retrieve = function(options) {
		const template = `
			<s:Body>
				<Retrieve xmlns="http://schemas.microsoft.com/xrm/2011/Contracts/Services"  xmlns:b="http://schemas.microsoft.com/xrm/2011/Contracts" xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
					{requetbody}
				</Retrieve>
			</s:Body>`;
		
		return util.executePostPromised(options, "Retrieve", template, serializer.toXmlRetrieve(options));
	};

	this.Create = function (options) {
		const template = `
			<s:Body>
				<Create xmlns="http://schemas.microsoft.com/xrm/2011/Contracts/Services"  xmlns:b="http://schemas.microsoft.com/xrm/2011/Contracts" xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:c="http://schemas.datacontract.org/2004/07/System.Collections.Generic">
					<entity>
						{requetbody}
					</entity>
				</Create>
			</s:Body>`;

        return util.executePostPromised(options, "Create", template, serializer.toXmlCreateUpdate(options));
    };

	this.Update = function (options) {
		const template = `
			<s:Body>
				<Update xmlns="http://schemas.microsoft.com/xrm/2011/Contracts/Services"  xmlns:b="http://schemas.microsoft.com/xrm/2011/Contracts" xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:c="http://schemas.datacontract.org/2004/07/System.Collections.Generic">
					<entity>
						{requetbody}
					</entity>
				</Update>
			</s:Body>`;

        return util.executePostPromised(options, "Update", template, serializer.toXmlCreateUpdate(options));
    }; 

	this.Delete = function (options) {
		const template = `
			<s:Body>
				<Delete xmlns="http://schemas.microsoft.com/xrm/2011/Contracts/Services"  xmlns:b="http://schemas.microsoft.com/xrm/2011/Contracts" xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:c="http://schemas.datacontract.org/2004/07/System.Collections.Generic">
					{requetbody}
				</Delete>
			</s:Body>`;
		
        return util.executePostPromised(options, "Delete", template, serializer.toXmlDelete(options));
    };

	this.Associate = function (options) {
		const template = `
			<s:Body>
				<Associate xmlns="http://schemas.microsoft.com/xrm/2011/Contracts/Services"  xmlns:b="http://schemas.microsoft.com/xrm/2011/Contracts" xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:c="http://schemas.datacontract.org/2004/07/System.Collections.Generic">
					{requetbody}
				</Associate>
			</s:Body>`;

        return util.executePostPromised(options, "Associate", template, serializer.toXmlAssociate(options));
    };

	this.Disassociate = function (options) {
		const template = `
			<s:Body>
				<Disassociate xmlns="http://schemas.microsoft.com/xrm/2011/Contracts/Services"  xmlns:b="http://schemas.microsoft.com/xrm/2011/Contracts" xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:c="http://schemas.datacontract.org/2004/07/System.Collections.Generic">
					{requetbody}
				</Disassociate>
			</s:Body>`;

		return util.executePostPromised(options, "Disassociate", template, serializer.toXmlAssociate(options));
    };

	this.Execute = function (options, cb) {
		var template = `
			<s:Body>
				<Execute xmlns="http://schemas.microsoft.com/xrm/2011/Contracts/Services"  xmlns:b="http://schemas.microsoft.com/xrm/2011/Contracts" xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:c="http://schemas.datacontract.org/2004/07/System.Collections.Generic">
					<!--Optional:-->
					<request>
						{requetbody}
					</request>
				</Execute>
			</s:Body>`;
		
        return util.executePostPromised(options, "Execute", template, serializer.toXmlExecute(options));
    };
}

module.exports = Message;