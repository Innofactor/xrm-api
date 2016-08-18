var https   = require('https');
var xpath   = require('xpath');
var url     = require('url');
var dom     = require('xmldom').DOMParser;

var username = "revathy.s2@919940209976.onmicrosoft.com";
var password = "password-1";
var domain = "919940209976";
var urlSuffix = ".crm5.dynamics.com"
var organizationPath = "/XRMServices/2011/Organization.svc";

var crmUrl = "https://" + domain + urlSuffix + organizationPath;

// Change this to an account record guid from your CRM Online system to test Step #2 
// This can usually be found by opening an account record in the browser and looking at the URL's query string 
// Tip: David Cabaniuk has written a nice & simple post that shows you how to find a sample account ID: http://www.crmcodex.com/2012/01/tip-get-record-id-quickly-and-easily/
//string accountId = "05C92E5C-1B29-E011-8691-1CC1DEF177C2";

// Step 0: Get URN address and STS Enpoint dynamically from WSDL

var options = {
            host: domain + ".api" + urlSuffix,
            path: '/XRMServices/2011/Discovery.svc?wsdl'
        };

var wsdl = "";
var wsdlImportURL;

// string WSDKImport = GetMethod(WSDLImportURL);
// string URNAddress = GetValueFromXML(WSDKImport, @"//*[local-name()='AuthenticationPolicy' and namespace-uri()='http://schemas.microsoft.com/xrm/2011/Contracts/Services']/*[local-name()='SecureTokenService' and namespace-uri()='http://schemas.microsoft.com/xrm/2011/Contracts/Services']//*[local-name()='AppliesTo' and namespace-uri()='http://schemas.microsoft.com/xrm/2011/Contracts/Services']/text()");
// string STSEnpoint = GetValueFromXML(WSDKImport, @"//*[local-name()='Issuer' and namespace-uri()='http://docs.oasis-open.org/ws-sx/ws-securitypolicy/200702']/*[local-name()='Address' and namespace-uri()='http://www.w3.org/2005/08/addressing']/text()");

//Get the WSDL file
var response = https.get(options, function (res) {
    res.on('data', function (chunk) { 
        wsdl += chunk; 
    });

    res.on('end', function () {
        var doc = new dom().parseFromString(wsdl);
        wsdlImportURL = xpath.select("//*[local-name(.)='import' and namespace-uri(.)='http://schemas.xmlsoap.org/wsdl/']/@location", doc)[0].value;
        
        var wsdlImportURLObject = url.parse(wsdlImportURL);
        var wsdlImportURLOptions = {host:wsdlImportURLObject.host, path:wsdlImportURLObject.path};

        //Get the WSDL Import file
        https.get(wsdlImportURLOptions, function (resImport) {
            var wsdlImport = "";

            resImport.on('data', function (chunk) { 
                wsdlImport += chunk; 
            });

            resImport.on('end', function () {
                console.log(wsdlImport);
                // var docWsdlImport = new dom().parseFromString(wsdlImport);
                // var URNAddress = xpath.select("//*[local-name()='AuthenticationPolicy' and namespace-uri()='http://schemas.microsoft.com/xrm/2011/Contracts/Services']/*[local-name()='SecureTokenService' and namespace-uri()='http://schemas.microsoft.com/xrm/2011/Contracts/Services']//*[local-name()='AppliesTo' and namespace-uri()='http://schemas.microsoft.com/xrm/2011/Contracts/Services']/text()", docWsdlImport)[0].data;
                
                // var STSEnpoint = xpath.select("//*[local-name()='Issuer' and namespace-uri()='http://docs.oasis-open.org/ws-sx/ws-securitypolicy/200702']/*[local-name()='Address' and namespace-uri()='http://www.w3.org/2005/08/addressing']/text()", docWsdlImport)[0].data;

                // console.log(STSEnpoint);
            });
        });

    });

});