# End of life notice
**This repository has not been maintained since 2016**

# MS Dynamics CRM client for Nodejs
This node module provides a set of methods to interact with MS Dynamics CRM Online services.
This is a pure SOAP proxy that supports LiveId authentication.

The module was named `dynamicscrm-api` and was created as part of [KidoZen](http://www.kidozen.com) project, as a connector for its Enterprise API feature in year 2013.

The module was updated and renamed to `xrm-api` by [Innofactor AB](http://www.innofactor.se) in 2016.

The code was exported from https://npmjs.com/ database and carefully saved in `git` repository preserving history as much as possible. Fork was done after trying reach original maintainers at **KidoZen** with propose update original package `dynamicscrm-api` and receiving no answer. All copyrights are preserved in `LICENSE` file as well in the `package.json`.

Main differences from original module:

* Updated dependencies;
* Removed not crucial dependencies (for sake of performance);
* All calls to service return promises instead of requiring callback;
* Added explicit support for OnPremise installations of MS Dynamics CRM;
* Code was restructured to become more readable;

Future plans:

* Browsers support (in progress);
* Shortcuts for additional request types currently done via `Execute` method;
* Performance improvements;
* Documentation update;

## Installation

Use npm to install the module:

```
> npm install xrm-api
```

## API

Due to the asynchrounous nature of Nodejs, this module uses promises in requests. All functions that promises call have 1 argument: either `err` or `data` depending on event type fired.

### Constructor

The module exports a class and its constructor requires a configuration object with following properties

* `domain`: Required string. Provide domain name for the On-Premises org. 
* `organizationid`: Required string. Sign in to your CRM org and click Settings, Customization, Developer Resources. On Developer Resource page, find the organization unique name under Your Organization Information.
* `username`: Optional dynamics Online's user name.
* `password`: Optional user's password.
* `returnJson`: Optional, default value is "true". Transforms the CRM XML Service response to a clean JSON response without namespaces.
* `discoveryServiceAddress`: Optional. You should not change this value unless you are sure. default value is "https://dev.crm.dynamics.com/XRMServices/2011/Discovery.svc"

```
var dynamics = require("xrm-api");
var dynamics = new dynamics({ 
	domain: "mycompany", 
	organizationid: "e00000ee0e000e0e00ee0eeee0e0e0ee",
	timeout: 5*60*1000 	// Timeout of 5 minutes
});
```

### Methods
All public methods has the same signature. The signature has two arguments: `options` and `callback`.
* `options` must be an object instance containig all parameters for the method.
* `callback` must be a function.

#### Authenticate(options, callback)

This method should be used to authenticate user's credentials. A successed authentication will return an object instance containing the authentication tokens that will be required by other methods.

**Parameters:**
* `options`: A required object instance containing authentication's parameters:
	* `username`: String.
	* `password`: String.
* `callback`: A required function for callback.

```
dynamics.Authenticate({ username:"foo", password: "bar" }, function(err, result) {
	if (err) return console.error (err);
	console.log (result.auth);
});
```

#### Create(options)

This method should be used to create new entities such as leads, contacts, etc.

**Parameters:**
* `options`: A required object instance containing authentication's parameters:
	* `LogicalName`: String. The name of the entity to create (Lead, Contact, etc. )
	* `Attributes`: Array of Key-Value strings .
	* `FormatedValues`: Array of Key-Value strings.

```
	var options = {};
	options.Attributes = [ { key:'lastname' , value :'Doe'} , { key:'firstname' , value :'John'}];
	options.LogicalName = 'lead';

	dynamics.Create(options)
        .then(function (data)) {
            console.log("Success!");
        })
        .catch(function (err) {
            console.log("Failure...");
        });
``` 

#### Update(options)

This method should be used to update an entity.

**Parameters:**
* `options`: A required object instance containing authentication's parameters:
	* `id`: Entity unique identifier.
	* `LogicalName`: String. The name of the entity to create (Lead, Contact, etc. )
	* `Attributes`: Array of Key-Value strings .
	* `FormatedValues`: Array of Key-Value strings.

```
	var options = {};
	options.id = '00000000-dddd-eeee-iiii-111111111111';	
	options.Attributes = [ { key:'companyname' , value :'Kidozen'}];
	options.LogicalName = 'lead';

	dynamics.Update(options) 
        .then(function (data)) {
            console.log("Success!");
        })
        .catch(function (err) {
            console.log("Failure...");
        });
``` 

#### Delete(options)

This method should be used to delete an entity.

**Parameters:**
* `options`: A required object instance containing authentication's parameters:
	* `id`: Entity unique identifier.
	* `EntityName`: String. The name of the entity to create (Lead, Contact, etc. )

```
	var options = {};
	options.id = '00000000-dddd-eeee-iiii-111111111111';	
	options.EntityName = 'lead';

	dynamics.Delete(options)
        .then(function (data)) {
            console.log("Success!");
        })
        .catch(function (err) {
            console.log("Failure...");
        });
``` 

#### Retrieve(options)

This method should be used to retrieve a single entity.

**Parameters:**
* `options`: A required object instance containing authentication's parameters:
	* `id`: Entity unique identifier.
	* `EntityName`: String. The name of the entity to create (Lead, Contact, etc. )
	* `ColumnSet`: Array of strings with the names of the columns to retrieve.	

```
	var options = {};
	options.id = '00000000-dddd-eeee-iiii-111111111111';	
	options.EntityName = 'lead';
	options.ColumnSet = ['firstname'];
	
	dynamics.Retrieve(options)
        .then(function (data)) {
            console.log("Success!");
        })
        .catch(function (err) {
            console.log("Failure...");
        });
``` 

#### RetrieveMultiple(options)

This method should be used to retrieve multiple entities.

**Parameters:**
* `options`: A required object instance containing authentication's parameters:
	* `id`: Entity unique identifier.
	* `EntityName`: String. The name of the entity to create (Lead, Contact, etc. )
	* `ColumnSet`: Array of strings with the names of the columns to retrieve.	

```
	var options = {};
	options.id = '00000000-dddd-eeee-iiii-111111111111';	
	options.EntityName = 'lead';
	options.ColumnSet = ['firstname'];
	
	dynamics.RetrieveMultiple(options) 
        .then(function (data)) {
            console.log("Success!");
        })
        .catch(function (err) {
            console.log("Failure...");
        });
``` 

#### Associate(options)

This method should be used to create a relation between entities.

**Parameters:**
* `options`: A required object instance containing authentication's parameters:
	* `EntityId`: Entity unique identifier.
	* `EntityName`: String. The name of the entity to create (Lead, Contact, etc. )
	* `RelationShip`: Object with the crm relationship details, such as schemaName ({ SchemaName: 'contact_customer_accounts'}).	
	* `RelatedEntities`: Array of related entities objects with the following values:
	* * `Id`: Related entity unique identifier.
	* * `LogicalName`: Name of the related entity.		

```
	var options = {};
	options.EntityId = '00000000-dddd-eeee-iiii-111111111111';	
	options.EntityName = 'account';
	options.RelationShip = { SchemaName: 'contact_customer_accounts'};
	options.RelatedEntities = [{Id : '00000000-dddd-0000-0000-111111111111',LogicalName : 'contact'}];
	
	dynamics.Associate(options) 
        .then(function (data)) {
            console.log("Success!");
        })
        .catch(function (err) {
            console.log("Failure...");
        });
``` 

#### Disassociate(options)

**Parameters:**
* `options`: A required object instance containing authentication's parameters:
	* `EntityId`: Entity unique identifier.
	* `EntityName`: String. The name of the entity to create (Lead, Contact, etc. )
	* `RelationShip`: Object with the crm relationship details, such as schemaName ({ SchemaName: 'contact_customer_accounts'}).	
	* `RelatedEntities`: Array of related entities objects with the following values:
	* * `Id`: Related entity unique identifier.
	* * `LogicalName`: Name of the related entity.	

```
	var options = {};
	options.EntityId = '00000000-dddd-eeee-iiii-111111111111';	
	options.EntityName = 'account';
	options.RelationShip = { SchemaName: 'contact_customer_accounts'};
	options.RelatedEntities = [{Id : '00000000-dddd-0000-0000-111111111111',LogicalName : 'contact'}];
	
	dynamics.Disassociate(options)
        .then(function (data)) {
            console.log("Success!");
        })
        .catch(function (err) {
            console.log("Failure...");
        });
``` 

#### Execute(options)

**Parameters:**
* `options`: A required object instance containing authentication's parameters:
	* `RequestName`: Name of the crm method to execute.
	* `Parameters`: : Array of Key-Value strings with the method's parameters names and values.	

```
	var options = {};
	options.RequestName = 'account';
	
	dynamics.Execute(options)
        .then(function (data)) {
            console.log("Success!");
        })
        .catch(function (err) {
            console.log("Failure...");
        });
``` 

#License 

Copyright (c) 2013 KidoZen, inc.
Copyright (c) 2016 Innofactor AB, inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

