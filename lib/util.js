/*jslint nomen: true, stupid: true */

// module dependencies
var xpath           = require("xpath");
var Cache           = require("mem-cache");
var domParser       = new (require("xmldom").DOMParser)();
var parseString     = require("xml2js").parseString;
var traverse        = require("traverse");
var WSTrustFlow     = require("../lib/ws-security/wsTrustFlow.js");
var constants       = require("constants");
var Agentkeepalive  = require("agentkeepalive");
var request         = require("request");
var ntlm = require("httpntlm/ntlm.js");

// this class implements all features
var Util = function (settings) {
    "use strict";

    var authenticationTypes = ["live_id", "microsoft_online", "federation", "ntlm"];

    // Arguments validation
    if (!settings || typeof settings !== "object")                                  throw new Error("'settings' argument must be an object instance.");
    if (!settings.domain || typeof settings.domain !== "string")                    throw new Error("'settings.domain' property is a required string.");
    if (settings.domainUrlSuffix && typeof settings.domainUrlSuffix !== "string")   throw new Error("'settings.domainUrlSuffix' must be string.");
    if (settings.timeout && typeof settings.timeout !== "number")                   throw new Error("'settings.timeout' property must be a number.");
    if (settings.username && typeof settings.username !== "string")                 throw new Error("'settings.username' property must be a string.");
    if (settings.password && typeof settings.password !== "string")                 throw new Error("'settings.password' property must be a string.");
    if (settings.port && typeof settings.port !== "number")                         throw new Error("'settings.port' property must be a number.");
    if (settings.organizationName && typeof settings.organizationName !== "string") throw new Error("'settings.organizationName' property must be a string.");

    //Set default value if authentication type is wrong or invalid
    if (!settings.authType || typeof settings.authType !== "string" || authenticationTypes.indexOf(settings.authType) === -1) settings.authType = "live_id";
	
	//Set default value if organization name is missing
	if (!settings.organizationName) {
		settings.organizationName = "";
	}
	
    // Sets default arguments values
    settings.timeout = settings.timeout || 15 * 60 * 1000;  // default sessions timeout of 15 minutes in ms
    settings.returnJson = true;
    settings.port = settings.port || (settings.useHttp ? 80 : 443);
    settings.hostName = settings.hostName || (function() {
        if (settings.domainUrlSuffix) {
            return settings.domain + settings.domainUrlSuffix;
        }

        return settings.domain + ".api.crm.dynamics.com";
    })();
    settings.userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36";

    settings.cacheTokenByAuth = new Cache(settings.timeout);
    settings.cacheAuthByUser = new Cache(settings.timeout);
    settings.tokensForDeviceCache = new Cache(settings.timeout);

    var defaultUrlSuffix = ".api.crm.dynamics.com",

        organizationPath                = "/XRMServices/2011/Organization.svc",
        organizationServiceEndpoint     = "https://" + settings.hostName + organizationPath,
        SOAPActionBase                  = "http://schemas.microsoft.com/xrm/2011/Contracts/Services/IOrganizationService/",
        endpoints,
        device,
        fetchEndpoints,
        loadOrRegisterDevice,
        getTokenUsingDeviceId,
        generateRandom,
        renameKey,
        executeSoapPost,
        deepObjCopy,
        defaultCb,
        authenticateUsingMicrosoftOnline,
        authenticateUsingLiveId,
        authenticateUsingFederation,
        authenticateUsingNTLM,
        addSecureOptions,
        parseResponse,
        authenticate,
        executePost,

        //load templates once
        microsoftOnlineSaml  = `
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing" xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
    <s:Header>
        <a:Action s:mustUnderstand="1">http://schemas.xmlsoap.org/ws/2005/02/trust/RST/Issue</a:Action>
        <a:ReplyTo>
            <a:Address>http://www.w3.org/2005/08/addressing/anonymous</a:Address>
        </a:ReplyTo>
        <a:To s:mustUnderstand="1">{toMustUnderstand}</a:To>
        <o:Security s:mustUnderstand="1" xmlns:o="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
            <o:UsernameToken>
                <o:Username>{username}</o:Username>
                <o:Password>{password}</o:Password>
            </o:UsernameToken>
        </o:Security>
    </s:Header>
    <s:Body>
        <t:RequestSecurityToken xmlns:t="http://schemas.xmlsoap.org/ws/2005/02/trust">
            <wsp:AppliesTo xmlns:wsp="http://schemas.xmlsoap.org/ws/2004/09/policy">
            <a:EndpointReference>
                <a:Address>{endpoint}</a:Address>
            </a:EndpointReference>
            </wsp:AppliesTo>
            <t:KeyType>http://schemas.xmlsoap.org/ws/2005/05/identity/NoProofKey</t:KeyType>
            <t:RequestType>http://schemas.xmlsoap.org/ws/2005/02/trust/Issue</t:RequestType>
            <t:TokenType>urn:oasis:names:tc:SAML:1.0:assertion</t:TokenType>
        </t:RequestSecurityToken>
    </s:Body>
</s:Envelope>`,

        authCreateDeviceMessage = `
<?xml version="1.0"?>
<DeviceAddRequest>
  <ClientInfo name="{newguid}" version="1.0" />
  <Authentication>
    <Membername>{username}</Membername>
    <Password>{password}</Password>
  </Authentication>
</DeviceAddRequest>`,

        authRequestDeviceTokenMessage = `
<?xml version="1.0" encoding="utf-8" ?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing" xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
    <s:Header>
        <a:Action s:mustUnderstand="1">http://schemas.xmlsoap.org/ws/2005/02/trust/RST/Issue</a:Action>
        <a:MessageID>urn:uuid:{messageuuid}</a:MessageID>
        <a:ReplyTo>
            <a:Address>http://www.w3.org/2005/08/addressing/anonymous</a:Address>
        </a:ReplyTo>
        <a:To s:mustUnderstand="1">{issuer}</a:To>
        <o:Security s:mustUnderstand="1" xmlns:o="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
            <u:Timestamp u:Id="_0">
                <u:Created>{timeCreated}</u:Created>
                <u:Expires>{timeExpires}</u:Expires>
            </u:Timestamp>
            <o:UsernameToken u:Id="devicesoftware">
                <o:Username>{deviceUsername}</o:Username>
                <o:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">{devicePassword}</o:Password>
            </o:UsernameToken>
        </o:Security>
    </s:Header>
    <s:Body>
        <t:RequestSecurityToken xmlns:t="http://schemas.xmlsoap.org/ws/2005/02/trust">
            <wsp:AppliesTo xmlns:wsp="http://schemas.xmlsoap.org/ws/2004/09/policy">
                <a:EndpointReference>
                    <a:Address>{liveIdAppliesTo}</a:Address>
                </a:EndpointReference>
            </wsp:AppliesTo>
            <t:RequestType>http://schemas.xmlsoap.org/ws/2005/02/trust/Issue</t:RequestType>
        </t:RequestSecurityToken>
    </s:Body>
</s:Envelope>`,

        authRequestSTSTokenMessage = `
<?xml version="1.0" encoding="utf-8" ?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing" xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
  <s:Header>
    <a:Action s:mustUnderstand="1">http://schemas.xmlsoap.org/ws/2005/02/trust/RST/Issue</a:Action>
    <a:MessageID>urn:uuid:{messageuuid}</a:MessageID>
    <a:ReplyTo>
      <a:Address>http://www.w3.org/2005/08/addressing/anonymous</a:Address>
    </a:ReplyTo>
    <a:To s:mustUnderstand="1">{issuer}</a:To>
    <o:Security s:mustUnderstand="1" xmlns:o="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <u:Timestamp u:Id="_0">
        <u:Created>{created}</u:Created>
        <u:Expires>{expires}</u:Expires>
      </u:Timestamp>
      <o:UsernameToken u:Id="user">
        <o:Username>{username}</o:Username>
        <o:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">{password}</o:Password>
      </o:UsernameToken>
      <wsse:BinarySecurityToken ValueType="urn:liveid:device" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
        <EncryptedData Id="BinaryDAToken0" Type="http://www.w3.org/2001/04/xmlenc#Element" xmlns="http://www.w3.org/2001/04/xmlenc#">
          <EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#tripledes-cbc"></EncryptionMethod>
          <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
            <ds:KeyName>http://Passport.NET/STS</ds:KeyName>
          </ds:KeyInfo>
          <CipherData>
            <CipherValue>{cipher}</CipherValue>
          </CipherData>
        </EncryptedData>
      </wsse:BinarySecurityToken>
    </o:Security>
  </s:Header>
  <s:Body>
    <t:RequestSecurityToken xmlns:t="http://schemas.xmlsoap.org/ws/2005/02/trust">
      <wsp:AppliesTo xmlns:wsp="http://schemas.xmlsoap.org/ws/2004/09/policy">
        <a:EndpointReference>
          <a:Address>urn:crmna:dynamics.com</a:Address>
        </a:EndpointReference>
      </wsp:AppliesTo>
      <wsp:PolicyReference URI="MBI_FED_SSL" xmlns:wsp="http://schemas.xmlsoap.org/ws/2004/09/policy"/>
      <t:RequestType>http://schemas.xmlsoap.org/ws/2005/02/trust/Issue</t:RequestType>
    </t:RequestSecurityToken>
  </s:Body>
</s:Envelope>`,

        soapEnvelopeMessage = `
<s:Envelope xmlns:s="{envelopeNS}" xmlns:a="http://www.w3.org/2005/08/addressing" xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
	{header}
	{body}
</s:Envelope>`,
        
        soapHeaderMessage = `
<s:Header>
    <a:Action s:mustUnderstand="1">http://schemas.microsoft.com/xrm/2011/Contracts/Services/IOrganizationService/{action}</a:Action>
    <a:MessageID>urn:uuid:{messageid}</a:MessageID>
    <a:ReplyTo>
      <a:Address>http://www.w3.org/2005/08/addressing/anonymous</a:Address>
    </a:ReplyTo>
    <a:To s:mustUnderstand="1">{crmurl}</a:To>
    {security}
</s:Header>`,

        faultTextXpath                  = "//*[local-name()='Fault']/*[local-name()='Reason']/*[local-name()='Text']/text()",
        importLocationXpath             = "//*[local-name()='import' and namespace-uri()='http://schemas.xmlsoap.org/wsdl/']/@location",
        authenticationTypeXpath         = "//*[local-name()='Authentication' and namespace-uri()='http://schemas.microsoft.com/xrm/2011/Contracts/Services']/text()",
        issuerAddressXpath              = "//*[local-name()='SignedSupportingTokens']/*[local-name()='Policy']/*[local-name()='IssuedToken']/*[local-name()='Issuer']/*[local-name()='Address']/text()",
        liveAppliesToXpath              = "//*[local-name()='LiveIdAppliesTo']/text()";

    var auth = new (require("./auth.js"))(settings);

    /*
    * Default callback function, it only throws an exception if an error was received.
    */
    defaultCb = function (err) {
        if (err) {
            throw err;
        }
    };

    addSecureOptions = function (reqOptions) {
        if (!settings.useHttp) {
            reqOptions.secureOptions = constants.SSL_OP_NO_TLSv1_2;
            reqOptions.ciphers = "ECDHE-RSA-AES256-SHA:AES256-SHA:RC4-SHA:RC4:HIGH:!MD5:!aNULL:!EDH:!AESGCM";
            reqOptions.honorCipherOrder = true;
        }
    };

    fetchEndpoints = function (cb) {
        if (endpoints) {
            return cb(null, endpoints);
        }

        var options = {
            uri: settings.useHttp ? "http://" : "https://" + settings.hostName + ":" + settings.port + organizationPath + "?wsdl",
        };

        addSecureOptions(options);

        request(options, function (err, res, body) {
            if (err) {
                return cb(err);
            }

            var resXml = domParser.parseFromString(body),
                fault = xpath.select(faultTextXpath, resXml),
                location,
                opts;

            if (fault.length > 0) {
                return cb(new Error(fault.toString()), null);
            }

            location = xpath.select(importLocationXpath, resXml)
                .map(function (attr) {
                    return attr.value;
                })[0];

            if (location.length > 0) {
                opts = { url: location };

                addSecureOptions(opts);

                request(opts, function (err, res, body) {
                    if (err) {
                        return cb(err);
                    }

                    var resXmlImport,
                        faultImport,
                        authenticationType,
                        issuerAddress,
                        liveAppliesTo,
                        identifier,
                        keyType,
                        keySize,
                        requireClientEntropy;

                    resXmlImport = domParser.parseFromString(body);
                    faultImport = xpath.select(faultTextXpath, resXmlImport);

                    if (faultImport.length > 0) {
                        return cb(new Error(faultImport.toString()), null);
                    }

                    authenticationType = xpath.select(authenticationTypeXpath, resXmlImport).toString();
                    issuerAddress = xpath.select(issuerAddressXpath, resXmlImport).toString();
                    liveAppliesTo = xpath.select(liveAppliesToXpath, resXmlImport).toString();
                    identifier = xpath.select("//*[local-name()='Identifier']/text()", resXmlImport).toString();
                    keyType = xpath.select("//*[local-name()='KeyType']/text()", resXmlImport).toString();
                    keySize = xpath.select("//*[local-name()='KeySize']/text()", resXmlImport).toString();
                    requireClientEntropy = (body.indexOf("RequireClientEntropy") > -1);

                    endpoints = {
                        AuthenticationType: authenticationType,
                        IssuerAddress: issuerAddress,
                        DeviceAddUrl: "https://login.live.com/ppsecure/DeviceAddCredential.srf",
                        LiveIdAppliesTo: liveAppliesTo,
                        Identifier: identifier,
                        KeyType: keyType,
                        KeySize: keySize,
                        RequireClientEntropy: requireClientEntropy
                    };
                    return cb(null, endpoints);
                });
            }
        });
    };

    loadOrRegisterDevice = function (options, cb) {
        if (device) return cb(null, device);

        var username = generateRandom(24, "aA#"),
            password = generateRandom(24, "aA#");

        authCreateDeviceMessage = authCreateDeviceMessage
            .replace("{newguid}", uuid.v4())
            .replace("{username}", username)
            .replace("{password}", password);

        options = {
            method: "POST",
            uri: options.DeviceAddUrl,
            body: authCreateDeviceMessage,
            headers: {
                "Content-Type": "application/soap+xml; charset=UTF-8",
                "Content-Length": authCreateDeviceMessage.length
            }
        };

        addSecureOptions(options);

        request(options, function (err, res, body) {
            if (err) {
                return cb(err);
            }

            var resXml = domParser.parseFromString(body),
                fault = xpath.select(faultTextXpath, resXml),
                puid;

            if (fault.length > 0) {
                return cb(new Error(fault.toString()), null);
            }

            puid = xpath.select("/DeviceAddResponse/puid/text()", resXml).toString();

            device = {
                deviceUsername: username,
                devicePassword: password,
                puid: puid
            };

            return cb(null, device);
        });
    };

    getTokenUsingDeviceId = function (options, cb) {
        var timeCreated = new Date(),
            timeExpires = new Date(timeCreated.getTime() + settings.timeout),
            cipher = settings.tokensForDeviceCache.get("auth_tokenrequest_device"),
            requestOptions;

        if (cipher) {
            return cb(null, cipher);
        }

        authRequestDeviceTokenMessage = authRequestDeviceTokenMessage
            .replace("{messageuuid}", uuid.v4())
            .replace("{timeCreated}", timeCreated.toISOString())
            .replace("{timeExpires}", timeExpires.toISOString())
            .replace("{issuer}", options.IssuerAddress)
            .replace("{liveIdAppliesTo}", options.LiveIdAppliesTo)
            .replace("{deviceUsername}", options.DeviceInfo.deviceUsername)
            .replace("{devicePassword}", options.DeviceInfo.devicePassword);

        requestOptions = {
            method: "POST",
            uri: options.IssuerAddress,
            body: authRequestDeviceTokenMessage,
            headers: {
                "Content-Type": "application/soap+xml; charset=UTF-8",
                "Content-Length": Buffer.byteLength(authRequestDeviceTokenMessage)
            }
        };

        addSecureOptions(requestOptions);

        request(requestOptions, function (err, res, body) {
            if (err) {
                return cb(err);
            }

            var resXml = domParser.parseFromString(body),
                fault = xpath.select(faultTextXpath, resXml),
                cipherValue;

            if (fault.length > 0) {
                return cb(new Error(fault.toString()), null);
            }

            cipherValue = xpath.select("//*[local-name()='RequestedSecurityToken' and namespace-uri()='http://schemas.xmlsoap.org/ws/2005/02/trust']/*[name()='EncryptedData']/*[name()='CipherData']/*[name()='CipherValue']/text()", resXml).toString();
            cipher = {CipherValue: cipherValue};

            settings.tokensForDeviceCache.set("auth_tokenrequest_device", cipher);

            return cb(null, cipher);
        });
    };

    generateRandom = function (length, chars) {
        var mask = "",
            result = "",
            i;

        if (chars.indexOf("a") > -1) {
            mask += "abcdefghijklmnopqrstuvwxyz";
        }
        if (chars.indexOf("A") > -1) {
            mask += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        }
        if (chars.indexOf("#") > -1) {
            mask += "0123456789";
        }
        if (chars.indexOf("!") > -1) {
            mask += "~`!@#$%^&*()_+-={}[]:\";'<>?,./|\\";
        }

        for (i = length; i > 0; i = i - 1) {
            result += mask[Math.round(Math.random() * (mask.length - 1))];
        }

        return result;
    };

    renameKey = function (objInd, prefixes) {
        var rk = objInd;
        prefixes.forEach(function (p) {
            if (objInd.indexOf(p) === 0) {
                rk = objInd.replace(p, "");
            }
        });

        return rk;
    };

    parseResponse = function (body, cb) {
        var data = body,
            prefixes,
            data_no_ns,
            resXml = domParser.parseFromString(body),
            fault = xpath.select(faultTextXpath, resXml);

        if (fault.length > 0) {
            return cb(new Error(fault.toString()));
        }
		
        if (settings.returnJson)
            parseString(body, {explicitArray: false}, function (err, jsondata) {
                if (err) {
                    return cb(err);
                }

                prefixes = [];
                //removes namespaces
                data_no_ns = traverse(jsondata).map(function () {
                    if (this.key !== undefined) {
                        var pos = this.key.indexOf("xmlns:"),
                            k = this.key.substring(6, this.key.length) + ":";

                        if (pos > -1 || this.key.indexOf("xmlns") > -1) {
                            if (prefixes.lastIndexOf(k) === -1) {
                                prefixes.push(k);
                            }

                            this.remove();
                        }
                    }
                });
                //removes 'xx:' prefixes
                data = deepObjCopy(data_no_ns, prefixes);
                cb(null, data);
            });

        else cb(null, data);
    };

    executeSoapPost = function (options, action, template, body, cb) {
        var timeCreated = new Date(),
            timeExpires = new Date(timeCreated.getTime() + 5 * 60000),
            requestOptions,
            soapHeader,
            xmlrequestbody,
            soapPostMessage,
            security,
            ntlmOptions,
            type1msg,
            agent,
            reqOptions,
            url,
            httpHeaders = {};

        xmlrequestbody = template.replace("{requetbody}", body);

        if (settings.authType === "ntlm") {
            soapPostMessage = soapEnvelopeMessage
                .replace("{envelopeNS}", "http://schemas.xmlsoap.org/soap/envelope/")
                .replace("{header}", "")
                .replace("{body}", xmlrequestbody);

            url = (settings.useHttp ? "http://" : "https://") + settings.hostName + ":" + settings.port + "/" + settings.organizationName + organizationPath + "/web";

            httpHeaders.cookie = "ReqClientId=" + options.ReqClientId;
            httpHeaders.SOAPAction = SOAPActionBase + action;
            httpHeaders["Content-Length"] = Buffer.byteLength(soapPostMessage);
            httpHeaders["Content-Type"] = "text/xml; charset=utf-8";
            httpHeaders.Accept = "application/xml, text/xml, */*";
            httpHeaders["User-Agent"] = settings.userAgent;

            ntlmOptions = {
                username: options.username || settings.username,
                password: options.password || settings.password,
                workstation: options.workstation || settings.workstation || "",
                domain: options.ntlmDomain || settings.ntlmDomain || ""
            };

            type1msg = ntlm.createType1Message(ntlmOptions);
            agent = settings.useHttp ? new Agentkeepalive() : new Agentkeepalive.HttpsAgent();

            reqOptions = {
                method: options.method || "GET",
                url: url,
                headers: {
                    Authorization: type1msg,
                },
                agent: agent,
                timeout: settings.requestTimeout
            };

            addSecureOptions(reqOptions);

            request(reqOptions, function (err, res) {
                if (err) {
                    return cb(err);
                }
                if (!res.headers["www-authenticate"]) {
                    return cb(new Error("www-authenticate not found on response of second request"));
                }

                var type2msg = ntlm.parseType2Message(res.headers["www-authenticate"]),
                    type3msg = ntlm.createType3Message(type2msg, ntlmOptions);

                httpHeaders.Authorization = type3msg;

                reqOptions = {
                    method: "POST",
                    url: url,
                    body: soapPostMessage,
                    agent: agent,
                    timeout: settings.requestTimeout,
                    headers: httpHeaders
                };

                addSecureOptions(reqOptions);

                request(reqOptions, function (err, res, body) {
                    if (err) {
                        return cb(err);
                    }

                    parseResponse(body, cb);
                });
            });

        } else {
            soapHeader = soapHeaderMessage
                .replace("{action}", action)
                .replace("{messageid}", uuid.v4())
                .replace("{crmurl}", organizationServiceEndpoint);

            if (options.encryptedData) {
                security = '<wsse:Security s:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">\
                    <u:Timestamp u:Id="_0">\
                    <u:Created>' + timeCreated.toISOString() + "</u:Created>\
                    <u:Expires>" + timeExpires.toISOString() + "</u:Expires>\
                    </u:Timestamp>" + options.encryptedData + "</wsse:Security>";

                soapHeader = soapHeader.replace("{security}", security);
            } else if (options.header) {
                soapHeader = soapHeader.replace("{security}", options.header);
            }
            else {
                return cb(new Error("Neither token or header found."));
            }

            url = (settings.useHttp ? "http://" : "https://") + settings.hostName + ":" + settings.port + organizationPath;
            soapPostMessage = soapEnvelopeMessage
                .replace("{envelopeNS}", "http://www.w3.org/2003/05/soap-envelope")
                .replace("{header}", soapHeader)
                .replace("{body}", xmlrequestbody);

            httpHeaders["Content-Type"] = "application/soap+xml; charset=UTF-8";
            httpHeaders["Content-Length"] = Buffer.byteLength(soapPostMessage);

            requestOptions = {
                method: "POST",
                uri: url,
                body: soapPostMessage,
                headers: httpHeaders
            };

            addSecureOptions(requestOptions);

            request(requestOptions, function (err, res, body) {
                if (err) {
                    return cb(err);
                }

                parseResponse(body, cb);
            });
        }
    };

    deepObjCopy = function (dupeObj, pfxs) {
        var retObj = {},
            objInd,
            rk;

        if (typeof dupeObj === "object") {
            if (dupeObj.length) {
                retObj = [];
            }

            for (objInd in dupeObj) {
                if (dupeObj.hasOwnProperty(objInd)) {
                    rk = renameKey(objInd, pfxs);
                    if (typeof dupeObj[objInd] === "object") {
                        retObj[rk] = deepObjCopy(dupeObj[objInd], pfxs);
                    } else if (typeof dupeObj[objInd] === "string") {
                        retObj[rk] = dupeObj[objInd];
                    } else if (typeof dupeObj[objInd] === "number") {
                        retObj[rk] = dupeObj[objInd];
                    } else if (typeof dupeObj[objInd] === "boolean") {
                        if (dupeObj[rk]) {
                            retObj[objInd] = true;
                        } else { 
                            retObj[objInd] = false;
                        }
                    }
                }
            }
        }
        return retObj;
    };

    executePost = function (options, action, template, body, cb) {
        var authItem;
        // handles optional 'options' argument
        if (!cb && typeof options === "function") {
            cb = options;
            options = {};
        }

        // sets default values
        cb = cb || defaultCb;
        options = options || {};
        if (!options || typeof options !== "object") { 
            return cb(new Error("'options' argument is missing or invalid."));
        }

        if (options.encryptedData || options.header) {
            executeSoapPost(options, action, template, body, cb);
        } else if (options.auth) {
            authItem = cacheTokenByAuth.get(options.auth);
            options.encryptedData = authItem.token; //For LiveId an MSOnline
            options.header = authItem.header; //For Federation
            options.ReqClientId = authItem.ReqClientId; //For NTLM

            executeSoapPost(options, action, template, body, cb);
        } else {
            auth.Do(options, function (err, data) {
                if (err) {
                    return cb(err);
                }

                authItem = settings.cacheTokenByAuth.get(data.auth);
                options.encryptedData = authItem.token; //For LiveId an MSOnline
                options.header = authItem.header; //For Federation
                
                executeSoapPost(options, action, template, body, cb);
            });
        }
    };

    this.executePostPromised = function(options, action, template, body) {
        return new Promise(function (fulfill, reject) {
            executePost(options, action, template, body, function (err, data) {
                if (err) {
                    reject(err);
                }
                fulfill(data);
            });
        });
    };
};

module.exports = Util;