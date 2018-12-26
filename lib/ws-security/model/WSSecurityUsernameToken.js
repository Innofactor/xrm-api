import { readFileSync } from "fs";
import { join } from "path";
import { v4 } from "uuid";
var template = readFileSync(
  join(__dirname, "/templates/WSSecurityUsernameToken.xml"),
  "utf-8"
);

class WSSecurityUsernameToken {
  constructor(opts) {
    var message = template
      .replace("{{username}}", opts.username)
      .replace("{{password}}", opts.password)
      .replace("{{uid}}", v4());
    this.toString = function() {
      return message;
    };
  }
}

export default WSSecurityUsernameToken;
