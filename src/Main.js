/*
* Module's dependencies
*/
import Util from './lib/util.js';
import Message from './lib/message.js';

class Dynamics {
    constructor(settings) {
        "use strict";
        // creates an instance of class that handles all requests
        var util = new Util(settings);
        var message = new Message(util);
        this.Create = function (options) {
            return message.Create(options);
        };
        this.Update = function (options) {
            return message.Update(options);
        };
        this.Retrieve = function (options) {
            return message.Retrieve(options);
        };
        this.RetrieveMultiple = function (options) {
            return message.RetrieveMultiple(options);
        };
        this.Associate = function (options) {
            return message.Associate(options);
        };
        this.Disassociate = function (options) {
            return message.Disassociate(options);
        };
        this.Execute = function (options) {
            return message.Execute(options);
        };
        this.Delete = function (options) {
            return message.Delete(options);
        };
    }
}

export default Dynamics;
