import { createHash } from "crypto";
import RequestSecurityToken from "./model/RequestSecurityToken";
import { parse } from "./model/RequestSecurityTokenResponse";
import SoapMessage from "./model/soapMessage";
import WSSecurityIssuedTokenWithSymmetricProofKey from "./model/WSSecurityIssuedTokenWithSymmetricProofKey";
import WSSecurityUsernameToken from "./model/WSSecurityUsernameToken";
import { send } from "./soapClient";



class WSTrustFlow {
  constructor(opts) {
    var self = this;
    this.getWSSecurityHeader = function(cb) {
      if (opts.useClientEntropy) {
        opts.clientEntropy = getRandomKey();
      }
      requestSecurityToken(opts, function(err, rstr) {
        if (err) {
          cb(err);
          return;
        }
        var header;
        try {
          header = new WSSecurityIssuedTokenWithSymmetricProofKey({
            clientEntropy: opts.clientEntropy,
            keySize: opts.keySize,
            created: rstr.created,
            expires: rstr.expires,
            serverEntropy: rstr.serverEntropy,
            token: rstr.token,
            keyIdentifier: rstr.keyIdentifier
          });
        } catch (e) {
          cb(e);
          return;
        }
        cb(null, header.toString());
      });
    };
    function requestSecurityToken(opts, cb) {
      var message = null;
      try {
        message = new SoapMessage({
          action: "http://schemas.xmlsoap.org/ws/2005/02/trust/RST/Issue",
          endpoint: opts.wstrustEndpoint,
          security: new WSSecurityUsernameToken({
            username: opts.username,
            password: opts.password
          }),
          body: new RequestSecurityToken({
            appliesTo: opts.appliesTo,
            clientEntropy: opts.clientEntropy,
            keyType: opts.keyType,
            keySize: opts.keySize
          })
        });
      } catch (e) {
        cb(e);
        return;
      }
      send(opts.wstrustEndpoint, message, function(err, res) {
        if (err) {
          cb(
            new Error(
              'An error ocurred trying to obtain the token: "' + err + '"'
            )
          );
          return;
        }
        if (res.statusCode != 200) {
          cb(
            new Error(
              'An error ocurred trying to obtain the token: "' + err + '"'
            )
          );
          return;
        }
        var rstr = parse(res.body);
        cb(null, rstr);
      });
    }
  }
}

function getRandomKey() {
  var length = 1024;
  var set =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz!@#$%^&*()<>?/[]{},.:;";
  var key = "";

  for (var i = 0; i < length; i++) {
    key += set.charAt(Math.floor(Math.random() * set.length));
  }

  return createHash("sha256")
    .update(key)
    .digest("base64");
}

export default WSTrustFlow;
