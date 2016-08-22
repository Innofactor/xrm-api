var Auth = function (util) {

    Authenticate = function (options, cb) {
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