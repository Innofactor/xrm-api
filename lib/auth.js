var httpntlm = require("httpntlm");
var ntlm = require("httpntlm/ntlm.js");
var cookie = require("cookie");
var uuid = require("node-uuid");

var Auth = function (settings) {

    var authenticateUsingMicrosoftOnline = function (opts, cb) {
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

    var authenticateUsingLiveId = function (options, cb) {
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
                                if (err) {
                                    return cb(err);
                                }

                                fullMessage = fullMessage + ". Details:" + data;
                                return cb(new Error(fullMessage), null);
                            });
                    });
                });
            });
        });
    };

    var authenticateUsingFederation = function (authOptions, cb) {
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
                if (err) {
                    return cb(err);
                }

                return cb(null, header);
            });
        });
    };

    var authenticateUsingNTLM = function (options, cb) {
        var authOptions = {
            url: (settings.useHttp ? "http://" : "https://") + settings.hostName + ":" + settings.port,
            username: options.username || settings.username,
            password: options.password || settings.password,
            workstation: options.workstation || settings.workstation || "",
            domain: options.ntlmDomain || settings.ntlmDomain || "",

            headers: {
                "User-Agent": settings.userAgent
            }
        };

        httpntlm.get(authOptions, function (err, res) {
            if (err) {
                return cb(err);
            }

            if (res.cookies.length === 0) {
                return cb(Error.create("Invalid Username or Password"));
            }

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

    this.Do = function (options, cb) {
        var responseXMLCB = function (err, resXml) {
                if (err) {
                    return cb(err);
                }

                var token = xpath.select("//*[local-name()='EncryptedData']", resXml).toString(),
                    authToken = uuid.v4(),
                    authItem = {token: token};

                cacheTokenByAuth.set(authToken, authItem);
                cacheAuthByUser.set(options.username, authToken);
                return cb(null, {auth: authToken});
            },

            federationCB = function (err, header) {
                if (err) {
                    return cb(err);
                }

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
        if (typeof options !== "object") {
            return cb(new Error("'options' argument is missing or invalid."));
        }

        // Validates username and password
        options.username = options.username || settings.username;
        options.password = options.password || settings.password;

        if (settings.authType === "microsoft_online") {
            authenticateUsingMicrosoftOnline(options, responseXMLCB);
        } else if (settings.authType === "federation") {
            authenticateUsingFederation(options, federationCB);
        } else if (settings.authType === "ntlm") {
            authenticateUsingNTLM(options, cb);
        } else {
            // Default Live Id
            authenticateUsingLiveId(options, responseXMLCB);
        }
    };
}

module.exports = Auth;