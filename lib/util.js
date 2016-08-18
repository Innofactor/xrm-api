/*jslint nomen: true, stupid: true */

// module dependencies
var https       = require('https');
var url         = require('url');
var xpath       = require('xpath');
var cookie      = require('cookie');
var Cache       = require("mem-cache");
var uuid        = require("node-uuid");
var domParser   = new (require('xmldom').DOMParser)();
var path        = require("path");
var urljs       = require("url");
var uuid        = require("node-uuid");
var fs          = require("fs");
var parser      = require('xml2json');
var traverse    = require('traverse');
var Serializer  = require('./serializer.js');
var util        = require('util');


// this class implements all features 
var Util = function (settings) {
    "use strict";

    var authenticationTypes = ["live_id", "microsoft_online"];

    // Arguments validation
    if (!settings || typeof settings !== "object") { throw new Error("'settings' argument must be an object instance."); }
    if (!settings.domain || typeof settings.domain !== "string") { throw new Error("'settings.domain' property is a required string."); }
    if (settings.domainUrlSuffix && typeof settings.domainUrlSuffix !== "string") { throw new Error("'settings.domainUrlSuffix' must be string."); }
    if (settings.timeout && typeof settings.timeout !== "number") { throw new Error("'settings.timeout' property must be a number."); }
    if (settings.username && typeof settings.username !== "string") { throw new Error("'settings.username' property must be a string."); }
    if (settings.password && typeof settings.password !== "string") { throw new Error("'settings.password' property must be a string."); }

    //Set default value if authentication type is wrong or invalid
    if (!settings.authType || typeof settings.authType !== "string" || authenticationTypes.indexOf(settings.authType) === -1) { settings.authType = "live_id"; }

    // Sets default arguments values
    settings.timeout = settings.timeout || 15 * 60 * 1000;  // default sessions timeout of 15 minutes in ms   
    settings.returnJson = true;                             // default sessions timeout of 15 minutes in ms   

    var self = this,     // Auto reference

        getHostname = function () {
            if (settings.domainUrlSuffix) {
                return settings.domain + settings.domainUrlSuffix;
            }
            return settings.domain + ".api.crm.dynamics.com";
        },

        hostname = getHostname(),
        organizationServiceEndpoint = 'https://' + hostname + '/XRMServices/2011/Organization.svc',
        //cache by user name, containing all authentication tokens
        usersCache   = new Cache(settings.timeout),   // Cache by auth tokens 
        tokensForDeviceCache   = new Cache(settings.timeout),
        endpoints,
        device,
        serializer = new Serializer(),
        fetchEndpoints,
        loadOrRegisterDevice,
        getTokenUsingDeviceId,
        generateRandom,
        getErrorMessage,
        renameKey,
        executeSoapPost,
        deepObjCopy,
        defaultCb,
        authenticateUsingMicrosoftOnline,
        authenticateUsingLiveId,

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

        faultTextXpath = "//*[local-name()='Fault']/*[local-name()='Reason']/*[local-name()='Text']/text()";

    // Cache by authentication token, containing all session instances
    Object.defineProperty(this, "cacheAuth", {
        enumerable: false,
        configurable: false,
        writable: false,
        value: new Cache(settings.timeout)
    });

    /*
    * Default callback function, it only throws an exception if an error was received.
    */
    defaultCb = function (err) {
        if (err) { throw err; }
    };

    fetchEndpoints = function (cb) {
        if (endpoints) {
            return cb(null, endpoints);
        }

        var options = {
                host: hostname,
                path: '/XRMServices/2011/Discovery.svc?wsdl'
            },

            response = https.get(options, function (res) {
                var xml = '';
                res.setEncoding('utf8');

                res.on('data', function (chunk) {
                    xml += chunk;
                });

                res.on('end', function () {
                    var resXml = domParser.parseFromString(xml),
                        fault = xpath.select(faultTextXpath, resXml),
                        location,
                        opts;

                    if (fault.length > 0) { return cb(new Error(fault.toString()), null); }

                    location = xpath.select("//*[local-name()='import' and namespace-uri()='http://schemas.xmlsoap.org/wsdl/']/@location",
                        resXml).map(function (attr) {
                        return attr.value;
                    })[0];

                    if (location.length > 0) {
                        opts = {
                            host: urljs.parse(location).host,
                            path: urljs.parse(location).pathname + urljs.parse(location).search
                        };

                        https.get(opts, function (res) {
                            var xmlImport = '',
                                resXmlImport,
                                faultImport,
                                authenticationType,
                                issuerAddress,
                                liveAppliesTo;

                            res.setEncoding('utf8');

                            res.on('data', function (chunk) {
                                xmlImport += chunk;
                            });

                            res.on('end', function () {
                                resXmlImport = domParser.parseFromString(xmlImport);
                                faultImport = xpath.select(faultTextXpath, resXmlImport);
                                if (faultImport.length > 0) { return cb(new Error(faultImport.toString()), null); }

                                authenticationType = xpath.select("//*[local-name()='Authentication' and namespace-uri()='http://schemas.microsoft.com/xrm/2011/Contracts/Services']/text()", resXmlImport).toString();
                                issuerAddress = xpath.select("//*[local-name()='SignedSupportingTokens']/*[local-name()='Policy']/*[local-name()='IssuedToken']/*[local-name()='Issuer']/*[local-name()='Address']/text()", resXmlImport).toString();
                                liveAppliesTo = xpath.select("//*[local-name()='LiveIdAppliesTo']/text()", resXmlImport).toString();

                                if (authenticationType === "LiveId") {
                                    endpoints = {
                                        AuthenticationType : authenticationType,
                                        IssuerAddress : issuerAddress,
                                        DeviceAddUrl : "https://login.live.com/ppsecure/DeviceAddCredential.srf",
                                        LiveIdAppliesTo : liveAppliesTo
                                    };
                                    return cb(null, endpoints);
                                }

                                throw new Error("'This version only implements 'LiveId' authentication type");
                            });
                        });
                    }
                });
            });

        response.on('error', function (err) {
            return cb(new Error(getErrorMessage(err)));
        });
    };

    loadOrRegisterDevice = function (options, cb) {
        if (device) {
            return cb(null, device);
        }

        var username = generateRandom(24, 'aA#'),
            password = generateRandom(24, 'aA#'),
            req;

        authCreateDeviceMessage = authCreateDeviceMessage
            .replace("{newguid}", uuid.v4())
            .replace("{username}", username)
            .replace("{password}", password);

        options = {
            method: 'POST',
            host: urljs.parse(options.DeviceAddUrl).host,
            path: urljs.parse(options.DeviceAddUrl).pathname,
            headers: {
                'Content-Type': 'application/soap+xml; charset=UTF-8',
                'Content-Length': authCreateDeviceMessage.length
            }
        };

        req = https.request(options, function (res) {
            var xml = '';
            res.setEncoding('utf8');

            res.on('data', function (chunk) {
                xml += chunk;
            });

            res.on('end', function () {
                var resXml = domParser.parseFromString(xml),
                    fault = xpath.select(faultTextXpath, resXml),
                    puid;

                if (fault.length > 0) { return cb(new Error(fault.toString()), null); }

                puid = xpath.select("/DeviceAddResponse/puid/text()", resXml).toString();

                device = {
                    deviceUsername : username,
                    devicePassword : password,
                    puid : puid
                };

                return cb(null, device);
            });
        });

        req.on('error', function (err) {
            return cb(new Error(getErrorMessage(err)));
        });

        req.end(authCreateDeviceMessage);
    };

    getTokenUsingDeviceId = function (options, cb) {
        var timeCreated = new Date(),
            timeExpires = new Date(timeCreated.getTime() + settings.timeout),
            cipher = tokensForDeviceCache.get("auth_tokenrequest_device"),
            requestOptions,
            req;

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
            method: 'POST',
            host: urljs.parse(options.IssuerAddress).host,
            path: urljs.parse(options.IssuerAddress).pathname,
            headers: {
                'Content-Type': 'application/soap+xml; charset=UTF-8',
                'Content-Length': authRequestDeviceTokenMessage.length
            }
        };

        req = https.request(requestOptions, function (res) {
            var xml = '';
            res.setEncoding('utf8');

            res.on('data', function (chunk) {
                xml += chunk;
            });

            res.on('end', function () {
                var resXml = domParser.parseFromString(xml),
                    fault = xpath.select(faultTextXpath, resXml),
                    cipherValue;

                if (fault.length > 0) { return cb(new Error(fault.toString()), null); }

                cipherValue = xpath.select("//*[local-name()='RequestedSecurityToken' and namespace-uri()='http://schemas.xmlsoap.org/ws/2005/02/trust']/*[name()='EncryptedData']/*[name()='CipherData']/*[name()='CipherValue']/text()", resXml).toString();
                cipher = {CipherValue : cipherValue};

                tokensForDeviceCache.set("auth_tokenrequest_device", cipher);

                return cb(null, cipher);
            });
        });

        req.on('error', function (err) {
            return cb(new Error(getErrorMessage(err)));
        });

        req.end(authRequestDeviceTokenMessage);
    };

    generateRandom = function (length, chars) {
        var mask = '',
            result = '',
            i;

        if (chars.indexOf('a') > -1) { mask += 'abcdefghijklmnopqrstuvwxyz'; }
        if (chars.indexOf('A') > -1) { mask += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; }
        if (chars.indexOf('#') > -1) { mask += '0123456789'; }
        if (chars.indexOf('!') > -1) { mask += '~`!@#$%^&*()_+-={}[]:";\'<>?,./|\\'; }

        for (i = length; i > 0; i = i - 1) {
            result += mask[Math.round(Math.random() * (mask.length - 1))];
        }

        return result;
    };

    getErrorMessage = function (err) {
        return (err.code === 'ENOTFOUND' ? 'Invalid host name' : err.toString()) + '\n' + err.stack;
    };

    renameKey = function (objInd, prefixes) {
        var rk = objInd;
        prefixes.forEach(function (p) {
            if (objInd.indexOf(p) === 0) {
                rk = objInd.replace(p, '');
            }
        });
        return rk;
    };

    executeSoapPost = function (options, action, template, body, cb) {
        var timeCreated = new Date(),
            timeExpires = new Date(timeCreated.getTime() + 5 * 60000),
            requestOptions,
            req,

            soapHeader = soapHeaderMessage
                .replace("{action}", action)
                .replace("{messageid}", uuid.v4())
                .replace("{crmurl}", organizationServiceEndpoint)
                .replace("{created}", timeCreated.toISOString())
                .replace("{expires}", timeExpires.toISOString())
                .replace("{keyidentifier}", options.KeyIdentifier)
                .replace("{cipher0}", options.CiperValue0)
                .replace("{cipher1}", options.CiperValue1),

            xmlrequestbody = template.replace("{requetbody}", body),

            soapPostMessage = soapEnvelopeMessage
                .replace("{header}", soapHeader)
                .replace("{body}", xmlrequestbody);

        requestOptions = {
            method: 'POST',
            host: hostname,
            path: '/XRMServices/2011/Organization.svc',
            headers: {
                'Content-Type': 'application/soap+xml; charset=UTF-8',
                'Content-Length': soapPostMessage.length
            }
        };

        req = https.request(requestOptions, function (res) {
            var xml = '';
            res.setEncoding('utf8');

            res.on('data', function (chunk) {
                xml += chunk;
            });

            res.on('end', function () {
                var resXml = domParser.parseFromString(xml),
                    fault = xpath.select(faultTextXpath, resXml),
                    data,
                    jsondata,
                    prefixes,
                    data_no_ns;

                if (fault.length > 0) { return cb(new Error(fault.toString())); }

                data = xml;
                if (settings.returnJson) {
                    jsondata = JSON.parse(parser.toJson(xml));
                    prefixes = [];
                    //removes namespaces
                    data_no_ns = traverse(jsondata).map(function () {
                        if (this.key !== undefined) {
                            var pos = this.key.indexOf('xmlns:'),
                                k = this.key.substring(6, this.key.length) + ':';

                            if (pos > -1 || this.key.indexOf('xmlns') > -1) {
                                if (prefixes.lastIndexOf(k) === -1) {
                                    prefixes.push(k);
                                }
                                this.remove();
                            }
                        }
                    });
                    //removes 'xx:' prefixes
                    data = deepObjCopy(data_no_ns, prefixes);
                }
                cb(null, data);
            });
        });

        req.on('error', function (err) {
            return cb(new Error(getErrorMessage(err)));
        });
        req.end(soapPostMessage);
    };

    var  deepObjCopy = function (dupeObj, pfxs) {
        var prefixArray = pfxs;
        var retObj = new Object();
        if (typeof(dupeObj) == 'object') {
            if (typeof(dupeObj.length) != 'undefined')
                var retObj = new Array();
                for (var objInd in dupeObj) {   
                    var rk = renameKey(objInd, pfxs);
                    if (typeof(dupeObj[objInd]) == 'object') {
                        retObj[rk] = deepObjCopy(dupeObj[objInd],pfxs);
                    } else if (typeof(dupeObj[objInd]) == 'string') {
                        retObj[rk] = dupeObj[objInd];
                    } else if (typeof(dupeObj[objInd]) == 'number') {
                        retObj[rk] = dupeObj[objInd];
                    } else if (typeof(dupeObj[objInd]) == 'boolean') {
                        ((dupeObj[rk] == true) ? retObj[objInd] = true : retObj[objInd] = false);
                    }
                }
            }   
        return retObj;
    }

    authenticateUsingMicrosoftOnline = function (opts, cb) {
        var loginEndpoint = "urn:crmapac:dynamics.com",
            username = opts.username,
            password = opts.password,

            //build full name condition for XPath expression
            name = function (name) {
                return "/*[name(.)='" + name + "']";
            },

            samlRequest = microsoftOnlineSaml
                .replace("{username}", username)
                .replace("{password}", password)
                .replace("{endpoint}", loginEndpoint),

            options = {
                method: 'POST',
                host: 'login.microsoftonline.com',
                path: '/extSTS.srf',
                headers: { 'Content-Length': samlRequest.length }
            },

            req = https.request(options, function (res) {
                var xml = '';
                res.setEncoding('utf8');

                res.on('data', function (chunk) {
                    xml += chunk;
                });

                res.on('end', function () {
                    // parses XML
                    var resXml = domParser.parseFromString(xml),

                    // search for a fault
                        exp = ['S:Envelope', 'S:Body', 'S:Fault', 'S:Detail', 'psf:error', 'psf:internalerror', 'psf:text'].map(name).join("") + "/text()",
                        fault = xpath.select(exp, resXml);

                    if (fault.length > 0) {
                        return cb(new Error(fault.toString()));
                    }

                    return cb(null, resXml);
                });
            });
        req.end(samlRequest);
    };

    authenticateUsingLiveId = function (options, cb) {
        var authOptions = options;

        fetchEndpoints(function (err, result) {
            if (err) { return cb(err); }

            authOptions = result;
            authOptions.username = options.username;
            authOptions.password = options.password;
            loadOrRegisterDevice(authOptions, function (err, result) {
                if (err) { return cb(err); }

                authOptions.DeviceInfo = result;
                getTokenUsingDeviceId(authOptions, function (err, result) {
                    if (err) { return cb(err); }

                    var timeCreated = new Date(),
                        timeExpires = new Date(timeCreated.getTime() + settings.timeout),
                        requestOptions,
                        req;

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
                        method: 'POST',
                        host: urljs.parse(authOptions.IssuerAddress).host,
                        path: urljs.parse(authOptions.IssuerAddress).pathname,
                        headers: {
                            'Content-Type': 'application/soap+xml; charset=UTF-8',
                            'Content-Length': authRequestSTSTokenMessage.length
                        }
                    };

                    req = https.request(requestOptions, function (res) {
                        var xml = '';

                        res.setEncoding('utf8');

                        res.on('data', function (chunk) {
                            xml += chunk;
                        });

                        res.on('end', function () {
                            var resXml = domParser.parseFromString(xml),
                                fault = xpath.select(faultTextXpath, resXml),
                                fullMessage,
                                faultDetailsXpath,
                                faultDetails;

                            if (fault.length > 0) {
                                fullMessage = fault.toString();
                                faultDetailsXpath = "//*[local-name()='Fault']/*[local-name()='Detail']";
                                faultDetails = xpath.select(faultDetailsXpath, resXml);

                                if (faultDetails.length > 0) {
                                    fullMessage = fullMessage + ". Details:" + parser.toJson(faultDetails.toString());
                                }

                                return cb(new Error(fullMessage), null);
                            }

                            return cb(null, resXml);
                        });
                    });

                    req.on('error', function (err) {
                        return cb(new Error(getErrorMessage(err)));
                    });

                    req.end(authRequestSTSTokenMessage);
                });
            });
        });
    };

    this.Authenticate = function (options, cb) {
        var auth = usersCache.get(options.username),
            item,
            responseXMLCB;

        if (auth) {
            item = self.cacheAuth.get(auth);
            return cb(null, item);
        }

        responseXMLCB = function (err, resXml) {
            if (err) { return cb(err); }

            var keyIdentifier = xpath.select("//*[local-name()='RequestedSecurityToken' and namespace-uri()='http://schemas.xmlsoap.org/ws/2005/02/trust']/*[name()='EncryptedData']/*[local-name()='KeyInfo' and namespace-uri()='http://www.w3.org/2000/09/xmldsig#']/*[name()='EncryptedKey']/*[local-name()='KeyInfo']/*[local-name()='SecurityTokenReference']/*[local-name()='KeyIdentifier']/text()", resXml).toString(),
                cipherValue0 = xpath.select("//*[local-name()='RequestedSecurityToken' and namespace-uri()='http://schemas.xmlsoap.org/ws/2005/02/trust']/*[name()='EncryptedData']/*[local-name()='KeyInfo' and namespace-uri()='http://www.w3.org/2000/09/xmldsig#']/*[name()='EncryptedKey']/*[local-name()='CipherData']/*[local-name()='CipherValue']/text()", resXml).toString(),
                cipherValue1 = xpath.select("//*[local-name()='RequestedSecurityToken' and namespace-uri()='http://schemas.xmlsoap.org/ws/2005/02/trust']/*[name()='EncryptedData']/*[name()='CipherData']/*[name()='CipherValue']/text()", resXml).toString(),

                userTokens = {
                    KeyIdentifier : keyIdentifier,
                    CiperValue0 : cipherValue0,
                    CiperValue1 : cipherValue1
                };

            self.cacheAuth.set(options.username, userTokens);
            return cb(null, userTokens);
        };

        // handles optional 'options' argument
        if (!cb && typeof options === 'function') {
            cb = options;
            options = {};
        }

        // sets default values
        cb = cb || defaultCb;
        options = options || {};

        // validates arguments values
        if (typeof options !== 'object') { return cb(new Error("'options' argument is missing or invalid.")); }

        // Validates username and password 
        options.username = options.username || settings.username;
        options.password = options.password || settings.password;

        if (settings.authType === "microsoft_online") {
            authenticateUsingMicrosoftOnline(options, responseXMLCB);
        } else {
            authenticateUsingLiveId(options, responseXMLCB);
        }
    };

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
        // handles optional 'options' argument
        if (!cb && typeof options === 'function') {
            cb = options;
            options = {};
        }

        // sets default values
        cb = cb || defaultCb;
        options = options || {};
        if (!options || typeof options !== 'object') {
            return cb(new Error("'options' argument is missing or invalid."));
        }

        if (options.KeyIdentifier && options.CiperValue0 && options.CiperValue1) {
            executeSoapPost(options, action, template, body, cb);
        } else {
            this.Authenticate(options, function (err, result) {
                if (err) { return cb(err); }

                options.KeyIdentifier = result.KeyIdentifier;
                options.CiperValue0 = result.CiperValue0;
                options.CiperValue1 = result.CiperValue1;

                executeSoapPost(options, action, template, body, cb);
            });
        }
    };
};

module.exports = Util;