/*jslint nomen: true, stupid: true */

// module dependencies
import Agentkeepalive, { HttpsAgent } from "agentkeepalive";
import { SSL_OP_NO_TLSv1_2 } from "constants";
import {
  createType1Message,
  createType3Message,
  parseType2Message
} from "httpntlm/ntlm.js";
import Cache from "mem-cache";
import request from "request";
import traverse from "traverse";
import { parseString } from "xml2js";
import { select } from "xpath";
var domParser = new (require("xmldom")).DOMParser();

// this class implements all features
class Util {
  constructor(settings) {
    "use strict";
    // Arguments validation
    if (!settings || typeof settings !== "object") {
      throw new Error("'settings' argument must be an object instance.");
    }
    if (!settings.hostName) {
      // If no direct hostname was supplied, check information about domain, and, probably, domainUrlSuffix
      if (!settings.domain || typeof settings.domain !== "string") {
        throw new Error("'settings.domain' property is a required string.");
      }
      if (
        settings.domainUrlSuffix &&
        typeof settings.domainUrlSuffix !== "string"
      ) {
        throw new Error("'settings.domainUrlSuffix' must be string.");
      }
    }
    // Set default value if organization name is missing
    if (!settings.organizationName) {
      settings.organizationName = "";
    }
    if (settings.timeout && typeof settings.timeout !== "number") {
      throw new Error("'settings.timeout' property must be a number.");
    }
    if (settings.username && typeof settings.username !== "string") {
      throw new Error("'settings.username' property must be a string.");
    }
    if (settings.password && typeof settings.password !== "string") {
      throw new Error("'settings.password' property must be a string.");
    }
    if (settings.port && typeof settings.port !== "number") {
      throw new Error("'settings.port' property must be a number.");
    }
    if (
      settings.organizationName &&
      typeof settings.organizationName !== "string"
    ) {
      throw new Error("'settings.organizationName' property must be a string.");
    }
    var authenticationTypes = [
      "live_id",
      "microsoft_online",
      "federation",
      "ntlm"
    ];
    // Set default value if authentication type is wrong or invalid
    if (
      !settings.authType ||
      typeof settings.authType !== "string" ||
      authenticationTypes.indexOf(settings.authType) === -1
    ) {
      settings.authType = "live_id";
    }
    // Sets default arguments values
    settings.timeout = settings.timeout || 15 * 60 * 1000; // default sessions timeout of 15 minutes in ms
    settings.returnJson = true;
    settings.port = settings.port || (settings.useHttp ? 80 : 443);
    settings.hostName =
      settings.hostName ||
      (function() {
        if (settings.domainUrlSuffix) {
          return settings.domain + settings.domainUrlSuffix;
        }
        // Default Url Suffix will point to CRM online instance
        return settings.domain + ".api.crm.dynamics.com";
      })();
    settings.userAgent =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36";
    settings.cacheTokenByAuth = new Cache(settings.timeout);
    settings.cacheAuthByUser = new Cache(settings.timeout);
    settings.tokensForDeviceCache = new Cache(settings.timeout);
    var organizationPath = "/XRMServices/2011/Organization.svc",
      organizationServiceEndpoint =
        "https://" + settings.hostName + organizationPath,
      SOAPActionBase =
        "http://schemas.microsoft.com/xrm/2011/Contracts/Services/IOrganizationService/",
      renameKey,
      executeSoapPost,
      deepObjCopy,
      defaultCb,
      addSecureOptions,
      parseResponse,
      executePost,
      faultTextXpath =
        "//*[local-name()='Fault']/*[local-name()='Reason']/*[local-name()='Text']/text()";
    var auth = new (require("./auth.js").default)(settings);
    /*
     * Default callback function, it only throws an exception if an error was received.
     */
    defaultCb = function(err) {
      if (err) {
        throw err;
      }
    };
    addSecureOptions = function(reqOptions) {
      if (!settings.useHttp) {
        reqOptions.secureOptions = SSL_OP_NO_TLSv1_2;
        reqOptions.ciphers =
          "ECDHE-RSA-AES256-SHA:AES256-SHA:RC4-SHA:RC4:HIGH:!MD5:!aNULL:!EDH:!AESGCM";
        reqOptions.honorCipherOrder = true;
      }
    };
    renameKey = function(objInd, prefixes) {
      var rk = objInd;
      prefixes.forEach(function(p) {
        if (objInd.indexOf(p) === 0) {
          rk = objInd.replace(p, "");
        }
      });
      return rk;
    };
    parseResponse = function(body, cb) {
      var data = body,
        prefixes,
        data_no_ns,
        resXml = domParser.parseFromString(body),
        fault = select(faultTextXpath, resXml);
      if (fault.length > 0) {
        return cb(new Error(fault.toString()));
      }
      if (settings.returnJson)
        parseString(body, { explicitArray: false }, function(err, jsondata) {
          if (err) {
            return cb(err);
          }
          prefixes = [];
          //removes namespaces
          data_no_ns = traverse(jsondata).map(function() {
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
    executeSoapPost = function(options, action, template, body, cb) {
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
      var soapEnvelopeMessage = `
            <s:Envelope xmlns:s="{envelopeNS}" xmlns:a="http://www.w3.org/2005/08/addressing" xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
                {header}
                {body}
            </s:Envelope>`;
      if (settings.authType === "ntlm") {
        soapPostMessage = soapEnvelopeMessage
          .replace("{envelopeNS}", "http://schemas.xmlsoap.org/soap/envelope/")
          .replace("{header}", "")
          .replace("{body}", xmlrequestbody);
        url =
          (settings.useHttp ? "http://" : "https://") +
          settings.hostName +
          ":" +
          settings.port +
          "/" +
          settings.organizationName +
          organizationPath +
          "/web";
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
        type1msg = createType1Message(ntlmOptions);
        agent = settings.useHttp ? new Agentkeepalive() : new HttpsAgent();
        reqOptions = {
          method: options.method || "GET",
          url: url,
          headers: {
            Authorization: type1msg
          },
          agent: agent,
          timeout: settings.requestTimeout
        };
        addSecureOptions(reqOptions);
        request(reqOptions, function(err, res) {
          if (err) {
            return cb(err);
          }
          if (!res.headers["www-authenticate"]) {
            return cb(
              new Error(
                "www-authenticate not found on response of second request"
              )
            );
          }
          var type2msg = parseType2Message(res.headers["www-authenticate"]),
            type3msg = createType3Message(type2msg, ntlmOptions);
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
          request(reqOptions, function(err, res, body) {
            if (err) {
              return cb(err);
            }
            parseResponse(body, cb);
          });
        });
      } else {
        soapHeader =
          `
                <s:Header>
                    <a:Action s:mustUnderstand="1">http://schemas.microsoft.com/xrm/2011/Contracts/Services/IOrganizationService/` +
          action +
          `</a:Action>
                    <a:MessageID>urn:uuid:` +
          uuid.v4() +
          `</a:MessageID>
                    <a:ReplyTo>
                    <a:Address>http://www.w3.org/2005/08/addressing/anonymous</a:Address>
                    </a:ReplyTo>
                    <a:To s:mustUnderstand="1">` +
          organizationServiceEndpoint +
          `</a:To>
                    {security}
                </s:Header>`;
        if (options.encryptedData) {
          security =
            `<wsse:Security s:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
                    <u:Timestamp u:Id="_0">\
                    <u:Created>` +
            timeCreated.toISOString() +
            `</u:Created>
                    <u:Expires>` +
            timeExpires.toISOString() +
            `</u:Expires>
                    </u:Timestamp>` +
            options.encryptedData +
            `</wsse:Security>`;
          soapHeader = soapHeader.replace("{security}", security);
        } else if (options.header) {
          soapHeader = soapHeader.replace("{security}", options.header);
        } else {
          return cb(new Error("Neither token or header found."));
        }
        url =
          (settings.useHttp ? "http://" : "https://") +
          settings.hostName +
          ":" +
          settings.port +
          organizationPath;
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
        request(requestOptions, function(err, res, body) {
          if (err) {
            return cb(err);
          }
          parseResponse(body, cb);
        });
      }
    };
    deepObjCopy = function(dupeObj, pfxs) {
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
    executePost = function(options, action, template, body, cb) {
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
        auth.Do(options, function(err, data) {
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
      return new Promise(function(fulfill, reject) {
        executePost(options, action, template, body, function(err, data) {
          if (err) {
            reject(err);
          }
          fulfill(data);
        });
      });
    };
  }
}

export default Util;
