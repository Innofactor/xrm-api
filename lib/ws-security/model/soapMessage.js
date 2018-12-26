import { readFileSync } from "fs";
import { join } from "path";
import { v4 } from "uuid";

var template = readFileSync(
  join(__dirname, "/templates/soapMessage.xml"),
  "utf-8"
);

class SoapMessage {
  constructor(opts) {
    var message = template;
    var security =
      typeof opts.security == "string"
        ? opts.security
        : opts.security.toString();
    var body = typeof opts.body == "string" ? opts.body : opts.body.toString();
    message = message
      .replace("{{action}}", opts.action)
      .replace("{{messageId}}", v4())
      .replace("{{to}}", opts.endpoint)
      .replace("{{security}}", security)
      .replace("{{body}}", body);
    this.toString = function() {
      return message;
    };
  }
}

export default SoapMessage;
