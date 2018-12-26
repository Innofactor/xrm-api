import { readFileSync } from "fs";
import { join } from "path";
var templateSymmetricWithEntropy = readFileSync(
  join(__dirname, "/templates/requestSecurityToken.symmetricWithEntropy.xml"),
  "utf-8"
);

class RequestSecurityToken {
  constructor(opts) {
    // in the future we must support bearer and asymmetric
    if (
      opts.keyType != "http://schemas.xmlsoap.org/ws/2005/02/trust/SymmetricKey"
    ) {
      throw new Error("Unsupported keyType: " + opts.keyType);
    }
    var message = templateSymmetricWithEntropy
      .replace("{{appliesTo}}", opts.appliesTo)
      .replace("{{keyType}}", opts.keyType)
      .replace("{{keySize}}", opts.keySize)
      .replace("{{clientEntropy}}", opts.clientEntropy);
    this.toString = function() {
      return message;
    };
  }
}

export default RequestSecurityToken;
