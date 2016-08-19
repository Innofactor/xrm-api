/*
* Module's dependencies
*/
require('simple-errors');
var Util    = require('./lib/util.js');
var Message = require('./lib/message.js');

var Dynamics = function (settings) {
    "use strict";

    // creates an instance of class that handles all requests
    var util = new Util(settings);
    var message = new Message(util);

    this.authenticate = function (options, cb) {
        util.Authenticate(options, cb);
    };

    // Compatibiliy backwards
    this.Authenticate = function (options, cb) {
        util.Authenticate(options, cb);
    };

    // 
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

    this.Associate = function (options, cb) {
        util.Associate(options, cb);
    };

    this.Disassociate = function (options, cb) {
        util.Disassociate(options, cb);
    };

    this.Execute = function (options, cb) {
        util.Execute(options, cb);
    };

    this.Delete = function (options, cb) {
        util.Delete(options, cb);
    };
};

module.exports = Dynamics;
