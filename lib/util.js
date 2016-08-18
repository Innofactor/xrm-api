/*jslint nomen: true, stupid: true */

// module dependencies
var xpath           = require("xpath");
var Cache           = require("mem-cache");
var uuid            = require("node-uuid");
var domParser       = new (require("xmldom").DOMParser)();
var fs              = require("fs");
var parseString     = require("xml2js").parseString;
var traverse        = require("traverse");
var Serializer      = require("./serializer.js");
var WSTrustFlow     = require("../lib/ws-security/wsTrustFlow.js");
var constants       = require("constants");
var cookie          = require("cookie");
var httpntlm        = require("httpntlm");
var ntlm            = require("httpntlm/ntlm.js");
var Agentkeepalive  = require("agentkeepalive");
var request         = require("request");
var kidoConnector   = require("kido-connector");

// this class implements all features
var Util = function (settings) {
    "use strict";

    var authenticationTypes = ["live_id", "microsoft_online", "federation", "ntlm"];

    // Arguments validation
    if (!settings || typeof settings !== "object") throw new Error("'settings' argument must be an object instance.");
    if (!settings.domain || typeof settings.domain !== "string") throw new Error("'settings.domain' property is a required string.");
    if (settings.domainUrlSuffix && typeof settings.domainUrlSuffix !== "string") throw new Error("'settings.domainUrlSuffix' must be string.");
    if (settings.timeout && typeof settings.timeout !== "number") throw new Error("'settings.timeout' property must be a number.");
    if (settings.username && typeof settings.username !== "string") throw new Error("'settings.username' property must be a string.");
    if (settings.password && typeof settings.password !== "string") throw new Error("'settings.password' property must be a string.");
    if (settings.port && typeof settings.port !== "number") throw new Error("'settings.port' property must be a number.");
    if (settings.organizationName && typeof settings.organizationName !== "string") throw new Error("'settings.organizationName' property must be a string.");

    //Set default value if authentication type is wrong or invalid
    if (!settings.authType || typeof settings.authType !== "string" || authenticationTypes.indexOf(settings.authType) === -1) settings.authType = "live_id";

    // Sets default arguments values
    settings.timeout = settings.timeout || 15 * 60 * 1000;  // default sessions timeout of 15 minutes in ms
    settings.returnJson = true;
    settings.port = settings.port || (settings.useHttp ? 80 : 443);

    var defaultUrlSuffix = ".api.crm.dynamics.com",

        getHostname = function () {
            if (settings.domainUrlSuffix) return settings.domain + settings.domainUrlSuffix;

            return settings.domain + defaultUrlSuffix;
        },

        hostname = getHostname(),
        organizationPath = "/XRMServices/2011/Organization.svc",
        organizationServiceEndpoint = "https://" + hostname + organizationPath,
        userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36",
        SOAPActionBase = "http://schemas.microsoft.com/xrm/2011/Contracts/Services/IOrganizationService/",
        cacheTokenByAuth = new Cache(settings.timeout),
        cacheAuthByUser = new Cache(settings.timeout),
        tokensForDeviceCache   = new Cache(settings.timeout),
        endpoints,
        device,
        serializer = new Serializer(),
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

        //load templates once
        microsoftOnlineSaml             = fs.readFileSync(__dirname + "/templates/microsoft_online_saml.xml").toString(),
        authCreateDeviceMessage         = fs.readFileSync(__dirname + "/templates/auth_create_device.xml").toString(),
        authRequestDeviceTokenMessage   = fs.readFileSync(__dirname + "/templates/auth_tokenrequest_device.xml").toString(),
        authRequestSTSTokenMessage      = fs.readFileSync(__dirname + "/templates/auth_tokenrequest_liveid.xml").toString(),

        soapEnvelopeMessage             = fs.readFileSync(__dirname + "/templates/soapMessage.xml").toString(),
        soapHeaderMessage               = fs.readFileSync(__dirname + "/templates/soapHeader.xml").toString(),

        apiRetrieveMultipleMessage      = fs.readFileSync(__dirname + "/templates/api_retrievemultiple.xml").toString(),
        apiRetrieveMessage              = fs.readFileSync(__dirname + "/templates/api_retrieve.xml").toString(),
        apiCreateMessage                = fs.readFileSync(__dirname + "/templates/api_create.xml").toString(),
        apiUpdateMessage                = fs.readFileSync(__dirname + "/templates/api_update.xml").toString(),
        apiDeleteMessage                = fs.readFileSync(__dirname + "/templates/api_delete.xml").toString(),
        apiExecuteMessage               = fs.readFileSync(__dirname + "/templates/api_execute.xml").toString(),
        apiAssociateMessage             = fs.readFileSync(__dirname + "/templates/api_asociate.xml").toString(),
        apiDisassociateMessage          = fs.readFileSync(__dirname + "/templates/api_disassociate.xml").toString(),

        faultTextXpath = "//*[local-name()='Fault']/*[local-name()='Reason']/*[local-name()='Text']/text()",
        importLocationXpath = "//*[local-name()='import' and namespace-uri()='http://schemas.xmlsoap.org/wsdl/']/@location",
        authenticationTypeXpath = "//*[local-name()='Authentication' and namespace-uri()='http://schemas.microsoft.com/xrm/2011/Contracts/Services']/text()",
        issuerAddressXpath = "//*[local-name()='SignedSupportingTokens']/*[local-name()='Policy']/*[local-name()='IssuedToken']/*[local-name()='Issuer']/*[local-name()='Address']/text()",
        liveAppliesToXpath = "//*[local-name()='LiveIdAppliesTo']/text()";

    /*
    * Default callback function, it only throws an exception if an error was received.
    */
    defaultCb = function (err) {
        if (err) throw err;
    };

    addSecureOptions = function (reqOptions) {
        if (!settings.useHttp) {
            reqOptions.secureOptions = constants.SSL_OP_NO_TLSv1_2;
            reqOptions.ciphers = "ECDHE-RSA-AES256-SHA:AES256-SHA:RC4-SHA:RC4:HIGH:!MD5:!aNULL:!EDH:!AESGCM";
            reqOptions.honorCipherOrder = true;
        }
    };

    fetchEndpoints = function (cb) {
        if (endpoints) return cb(null, endpoints);

        var options = {
                uri: settings.useHttp ? "http://" : "https://" + hostname + ":" + settings.port + organizationPath + "?wsdl",
            };

        addSecureOptions(options);

        request(options, function (err, res, body) {
            if (err) return cb(err);

            var resXml = domParser.parseFromString(body),
                fault = xpath.select(faultTextXpath, resXml),
                location,
                opts;

            if (fault.length > 0) return cb(new Error(fault.toString()), null);

            location = xpath.select(importLocationXpath, resXml)
                .map(function (attr) {
                    return attr.value;
                })[0];

            if (location.length > 0) {
                opts = { url: location };

                addSecureOptions(opts);

                request(opts, function (err, res, body) {
                    if (err) return cb(err);

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
                    if (faultImport.length > 0) return cb(new Error(faultImport.toString()), null);

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
            if (err) return cb(err);

            var resXml = domParser.parseFromString(body),
                fault = xpath.select(faultTextXpath, resXml),
                puid;

            if (fault.length > 0) return cb(new Error(fault.toString()), null);

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
            cipher = tokensForDeviceCache.get("auth_tokenrequest_device"),
            requestOptions;

        if (cipher) return cb(null, cipher);

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
            if (err) return cb(err);

            var resXml = domParser.parseFromString(body),
                fault = xpath.select(faultTextXpath, resXml),
                cipherValue;

            if (fault.length > 0) return cb(new Error(fault.toString()), null);

            cipherValue = xpath.select("//*[local-name()='RequestedSecurityToken' and namespace-uri()='http://schemas.xmlsoap.org/ws/2005/02/trust']/*[name()='EncryptedData']/*[name()='CipherData']/*[name()='CipherValue']/text()", resXml).toString();
            cipher = {CipherValue: cipherValue};

            tokensForDeviceCache.set("auth_tokenrequest_device", cipher);

            return cb(null, cipher);
        });
    };

    generateRandom = function (length, chars) {
        var mask = "",
            result = "",
            i;

        if (chars.indexOf("a") > -1) mask += "abcdefghijklmnopqrstuvwxyz";
        if (chars.indexOf("A") > -1) mask += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        if (chars.indexOf("#") > -1) mask += "0123456789";
        if (chars.indexOf("!") > -1) mask += "~`!@#$%^&*()_+-={}[]:\";'<>?,./|\\";

        for (i = length; i > 0; i = i - 1)
            result += mask[Math.round(Math.random() * (mask.length - 1))];

        return result;
    };

    renameKey = function (objInd, prefixes) {
        var rk = objInd;
        prefixes.forEach(function (p) {
            if (objInd.indexOf(p) === 0) rk = objInd.replace(p, "");
        });
        return rk;
    };

    parseResponse = function (body, cb) {
        var data = body,
            prefixes,
            data_no_ns,
            resXml = domParser.parseFromString(body),
            fault = xpath.select(faultTextXpath, resXml);

        if (fault.length > 0) return cb(new Error(fault.toString()));

        if (settings.returnJson)
            parseString(body, {explicitArray: false}, function (err, jsondata) {
                if (err) return cb(err);

                prefixes = [];
                //removes namespaces
                data_no_ns = traverse(jsondata).map(function () {
                    if (this.key !== undefined) {
                        var pos = this.key.indexOf("xmlns:"),
                            k = this.key.substring(6, this.key.length) + ":";

                        if (pos > -1 || this.key.indexOf("xmlns") > -1) {
                            if (prefixes.lastIndexOf(k) === -1) prefixes.push(k);

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
        kidoConnector.isHostAllowed(hostname, function (err, allowed) {
            if (err) return cb(err);
            if (!allowed) return cb(new Error("The hostname is not allowed"));

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

                url = (settings.useHttp ? "http://" : "https://") + hostname + ":" + settings.port + "/" + settings.organizationName + organizationPath + "/web";

                httpHeaders.cookie = "ReqClientId=" + options.ReqClientId;
                httpHeaders.SOAPAction = SOAPActionBase + action;
                httpHeaders["Content-Length"] = Buffer.byteLength(soapPostMessage);
                httpHeaders["Content-Type"] = "text/xml; charset=utf-8";
                httpHeaders.Accept = "application/xml, text/xml, */*";
                httpHeaders["User-Agent"] = userAgent;

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
                    if (err) return cb(err);
                    if (!res.headers["www-authenticate"]) return cb(new Error("www-authenticate not found on response of second request"));

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
                        if (err) return cb(err);

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

                } else if (options.header) soapHeader = soapHeader.replace("{security}", options.header);

                else return cb(new Error("Neither token or header found."));

                url = (settings.useHttp ? "http://" : "https://") + hostname + ":" + settings.port + organizationPath;
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
                    if (err) return cb(err);

                    parseResponse(body, cb);
                });
            }
        });
    };

    deepObjCopy = function (dupeObj, pfxs) {
        var retObj = {},
            objInd,
            rk;

        if (typeof dupeObj === "object") {
            if (dupeObj.length) retObj = [];

            for (objInd in dupeObj) {
                if (dupeObj.hasOwnProperty(objInd)) {
                    rk = renameKey(objInd, pfxs);
                    if (typeof dupeObj[objInd] === "object") retObj[rk] = deepObjCopy(dupeObj[objInd], pfxs);
                    else if (typeof dupeObj[objInd] === "string") retObj[rk] = dupeObj[objInd];
                    else if (typeof dupeObj[objInd] === "number") retObj[rk] = dupeObj[objInd];
                    else if (typeof dupeObj[objInd] === "boolean")
                        if (dupeObj[rk]) retObj[objInd] = true;
                        else retObj[objInd] = false;
                }
            }
        }
        return retObj;
    };

    authenticateUsingMicrosoftOnline = function (opts, cb) {
        var loginEndpoint = "urn:crmapac:dynamics.com",
            username = opts.username,
            password = opts.password,
            host = "login.microsoftonline.com",
            path = "/extSTS.srf",

            //build full name condition for XPath expression
            name = function (name) {
                return "/*[name(.)='" + name + "']";
            },

            samlRequest = microsoftOnlineSaml
                .replace("{username}", username)
                .replace("{password}", password)
                .replace("{toMustUnderstand}", "https://" + host + path)
                .replace("{endpoint}", loginEndpoint),

            options = {
                method: "POST",
                uri: "https://" + host + path,
                body: samlRequest,
                headers: { "Content-Length": Buffer.byteLength(samlRequest) }
            };

        addSecureOptions(options);

        request(options, function (err, res, body) {
            if (err) return cb(err);

            var resXml = domParser.parseFromString(body),

            // search for a fault
                exp = ["S:Envelope", "S:Body", "S:Fault", "S:Detail", "psf:error", "psf:internalerror", "psf:text"].map(name).join("") + "/text()",
                fault = xpath.select(exp, resXml);

            if (fault.length > 0) return cb(new Error(fault.toString()));

            return cb(null, resXml);
        });
    };

    authenticateUsingLiveId = function (options, cb) {
        var authOptions = options;

        fetchEndpoints(function (err, result) {
            if (err) return cb(err);

            authOptions = result;
            authOptions.username = options.username;
            authOptions.password = options.password;
            loadOrRegisterDevice(authOptions, function (err, result) {
                if (err) return cb(err);

                authOptions.DeviceInfo = result;
                getTokenUsingDeviceId(authOptions, function (err, result) {
                    if (err) return cb(err);

                    var timeCreated = new Date(),
                        timeExpires = new Date(timeCreated.getTime() + settings.timeout),
                        requestOptions;

                    authOptions.cipherValue = result.CipherValue;
                    authRequestSTSTokenMessage = authRequestSTSTokenMessage
                        .replace("{messageuuid}", uuid.v4())
                        .replace("{created}", timeCreated.toISOString())
                        .replace("{expires}", timeExpires.toISOString())
                        .replace("{issuer}", authOptions.IssuerAddress)
                        .replace("{cipher}", authOptions.cipherValue)
                        .replace("{username}", authOptions.username)
                        .replace("{password}", authOptions.password);

                    requestOptions = {
                        method: "POST",
                        uri: authOptions.IssuerAddress,
                        body: authRequestSTSTokenMessage,
                        headers: {
                            "Content-Type": "application/soap+xml; charset=UTF-8",
                            "Content-Length": Buffer.byteLength(authRequestSTSTokenMessage)
                        }
                    };

                    addSecureOptions(requestOptions);

                    request(requestOptions, function (err, res, body) {
                        if (err) return cb(err);

                        var resXml = domParser.parseFromString(body),
                            fault = xpath.select(faultTextXpath, resXml),
                            fullMessage,
                            faultDetailsXpath,
                            faultDetails;

                        if (fault.length <= 0) return cb(null, resXml);

                        fullMessage = fault.toString();
                        faultDetailsXpath = "//*[local-name()='Fault']/*[local-name()='Detail']";
                        faultDetails = xpath.select(faultDetailsXpath, resXml);

                        if (faultDetails.length > 0)
                            parseString(faultDetails.toString(), {explicitArray: false}, function (err, data) {
                                if (err) return cb(err);

                                fullMessage = fullMessage + ". Details:" + data;
                                return cb(new Error(fullMessage), null);
                            });
                    });
                });
            });
        });
    };

    authenticateUsingFederation = function (authOptions, cb) {
        fetchEndpoints(function (err, wsdlInfo) {
            if (err) return cb(err);
            var wstrustFlowOptions,
                flow,
                identifier = wsdlInfo.Identifier.replace("http://", "https://"),
                keyTypeUnsupported = "http://docs.oasis-open.org/ws-sx/ws-trust/200512/SymmetricKey";

            if (wsdlInfo.KeyType === keyTypeUnsupported)
                wsdlInfo.KeyType = "http://schemas.xmlsoap.org/ws/2005/02/trust/SymmetricKey";

            wstrustFlowOptions = {
                wstrustEndpoint: identifier + "/2005/usernamemixed",
                username: authOptions.username,
                password: authOptions.password,
                appliesTo: organizationServiceEndpoint,
                useClientEntropy: wsdlInfo.RequireClientEntropy,
                keyType: wsdlInfo.KeyType,
                keySize: wsdlInfo.KeySize
            };

            flow = new WSTrustFlow(wstrustFlowOptions);
            flow.getWSSecurityHeader(function (err, header) {
                if (err) return cb(err);

                return cb(null, header);
            });
        });
    };

    authenticateUsingNTLM = function (options, cb) {
        var authOptions = {
            url: (settings.useHttp ? "http://" : "https://") + hostname + ":" + settings.port,
            username: options.username || settings.username,
            password: options.password || settings.password,
            workstation: options.workstation || settings.workstation || "",
            domain: options.ntlmDomain || settings.ntlmDomain || "",

            headers: {
                "User-Agent": userAgent
            }
        };

        httpntlm.get(authOptions, function (err, res) {
            if (err) return cb(err);
            if (res.cookies.length === 0) return cb(Error.create("Invalid Username or Password"));

            var cookies = cookie.parse(res.headers["set-cookie"].join(";")),
                authToken = uuid.v4(),
                session = {
                    username: options.username,
                    password: options.password,
                    ReqClientId: cookies.ReqClientId
                };

            cacheTokenByAuth.set(authToken, session);
            cacheAuthByUser.set(options.username, authToken);
            return cb(null, {auth: authToken, username: options.username});
        });
    };

    this.Authenticate = function (options, cb) {
        kidoConnector.isHostAllowed(hostname, function (err, allowed) {
            if (err) return cb(err);
            if (!allowed) return cb(new Error("The hostname is not allowed"));

            var responseXMLCB = function (err, resXml) {
                    if (err) return cb(err);

                    var token = xpath.select("//*[local-name()='EncryptedData']", resXml).toString(),
                        authToken = uuid.v4(),
                        authItem = {token: token};

                    cacheTokenByAuth.set(authToken, authItem);
                    cacheAuthByUser.set(options.username, authToken);
                    return cb(null, {auth: authToken});
                },

                federationCB = function (err, header) {
                    if (err) return cb(err);

                    var authToken = uuid.v4(),
                        authItem = {header: header};

                    cacheTokenByAuth.set(authToken, authItem);
                    cacheAuthByUser.set(options.username, authToken);
                    return cb(null, {auth: authToken});
                };

            // handles optional 'options' argument
            if (!cb && typeof options === "function") {
                cb = options;
                options = {};
            }

            // sets default values
            cb = cb || defaultCb;
            options = options || {};

            // validates arguments values
            if (typeof options !== "object") return cb(new Error("'options' argument is missing or invalid."));

            // Validates username and password
            options.username = options.username || settings.username;
            options.password = options.password || settings.password;

            if (settings.authType === "microsoft_online") authenticateUsingMicrosoftOnline(options, responseXMLCB);
            else if (settings.authType === "federation") authenticateUsingFederation(options, federationCB);
            else if (settings.authType === "ntlm") authenticateUsingNTLM(options, cb);
             //Default Live Id
            else authenticateUsingLiveId(options, responseXMLCB);

        });
    };

    this.authenticate = this.Authenticate;

    /*
    RetrieveMultiple public and private methods
    */
    this.RetrieveMultiple = function (options, cb) {
        this.executePost(options, "RetrieveMultiple", apiRetrieveMultipleMessage, serializer.toXmlRetrieveMultiple(options), cb);
    };

    /*
    Retrieve  public and private methods
    */
    this.Retrieve = function (options, cb) {
        this.executePost(options, "Retrieve", apiRetrieveMessage, serializer.toXmlRetrieve(options), cb);
    };

    /*
    Create  public and private methods
    */
    this.Create = function (options, cb) {
        this.executePost(options, "Create", apiCreateMessage, serializer.toXmlCreateUpdate(options), cb);
    };

    /*
    Update  public and private methods
    */
    this.Update = function (options, cb) {
        this.executePost(options, "Update", apiUpdateMessage, serializer.toXmlCreateUpdate(options), cb);
    };

    /*
    Update  public and private methods
    */
    this.Delete = function (options, cb) {
        this.executePost(options, "Delete", apiDeleteMessage, serializer.toXmlDelete(options), cb);
    };

    /*
    Execute  public and private methods
    */
    this.Execute = function (options, cb) {
        this.executePost(options, "Execute", apiExecuteMessage, serializer.toXmlExecute(options), cb);
    };

    /*
    Associate  public and private methods
    */
    this.Associate = function (options, cb) {
        this.executePost(options, "Associate", apiAssociateMessage, serializer.toXmlAssociate(options), cb);
    };

    this.Disassociate = function (options, cb) {
        this.executePost(options, "Disassociate", apiDisassociateMessage, serializer.toXmlAssociate(options), cb);
    };

    this.executePost = function (options, action, template, body, cb) {
        var authItem;
        // handles optional 'options' argument
        if (!cb && typeof options === "function") {
            cb = options;
            options = {};
        }

        // sets default values
        cb = cb || defaultCb;
        options = options || {};
        if (!options || typeof options !== "object") return cb(new Error("'options' argument is missing or invalid."));

        if (options.encryptedData || options.header) executeSoapPost(options, action, template, body, cb);
        else if (options.auth) {
            authItem = cacheTokenByAuth.get(options.auth);
            options.encryptedData = authItem.token; //For LiveId an MSOnline
            options.header = authItem.header; //For Federation
            options.ReqClientId = authItem.ReqClientId; //For NTLM

            executeSoapPost(options, action, template, body, cb);
        } else
            this.Authenticate(options, function (err, data) {
                if (err) return cb(err);

                authItem = cacheTokenByAuth.get(data.auth);
                options.encryptedData = authItem.token; //For LiveId an MSOnline
                options.header = authItem.header; //For Federation

                executeSoapPost(options, action, template, body, cb);
            });
    };
};

module.exports = Util;