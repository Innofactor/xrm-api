/*global describe, before, beforeEach, it */

var assert      = require('assert');
var Dynamics    = require('../index.js');

var settingsForMicrosoftOnlineAuth = {
        username : "",
        password : "",
        organizationid : "",
        domain : "",
        domainUrlSuffix: "",
        authType: "microsoft_online" //Office365
    },

    settingsForLiveIdAuth = {
        username : "",
        password : "",
        organizationid : "",
        domain: "",
        authType: "live_id"
    };

describe("Dynamics integration tests.", function () {
    "use strict";

    describe("Constructor", function () {
        it("should fail with invalid settings", function () {
            assert.throws(function () {
                var dynamics = new Dynamics("");
                assert.ok(!dynamics);
            });
        });

        it("should fail with empty settings", function () {
            assert.throws(function () {
                var dynamics = new Dynamics({});
                assert.ok(!dynamics);
            });
        });

        it("should fail with no domain", function () {
            assert.throws(function () {
                var dynamics = new Dynamics({organizationid: "foo"});
                assert.ok(!dynamics);
            });
        });

        it("should fail with invalid timeout", function () {
            assert.throws(function () {
                var dynamics = new Dynamics({organizationid: "foo",
                    domain: "foo",
                    timeout: "bar"});
                assert.ok(!dynamics);
            });
        });

        it("should fail with invalid username", function () {
            assert.throws(function () {
                var dynamics = new Dynamics({organizationid: "foo",
                    domain: "foo",
                    username: 3600});
                assert.ok(!dynamics);
            });
        });

        it("should fail with invalid password", function () {
            assert.throws(function () {
                var dynamics = new Dynamics({organizationid: "foo",
                    domain: "foo",
                    password: 3600});
                assert.ok(!dynamics);
            });
        });

        it("should not fail with no authType", function () {
            var dynamics = new Dynamics({organizationid: "foo",
                domain: "foo"});
            assert.ok(dynamics);
        });

        it("should not fail with invalid type of authType", function () {
            var dynamics = new Dynamics({organizationid: "foo",
                domain: "foo",
                authType: 123});
            assert.ok(dynamics);
        });

        it("should not fail with invalid value of authType", function () {
            var dynamics = new Dynamics({organizationid: "foo",
                domain: "foo",
                authType: "invalid"});
            assert.ok(dynamics);
        });

        it("should fail with invalid domainUrlSuffix", function () {
            assert.throws(function () {
                var dynamics = new Dynamics({organizationid: "foo",
                    domain: "foo",
                    authType: "live_id",
                    domainUrlSuffix: 123});
                assert.ok(!dynamics);
            });
        });
    });

    describe("LiveID Authentication", function () {
        var settings,
            dynamics;

        beforeEach(function () {
            settings = settingsForLiveIdAuth;
            dynamics = new Dynamics(settings);
        });

        it("Should fail with invalid credentials", function (done) {
            dynamics.Authenticate({username: "invalid"}, function (err, result) {
                assert.ok(err);
                assert.ok(!result);
                done();
            });
        });

        it("Should authenticate OK", function (done) {
            dynamics.Authenticate({}, function (err, result) {
                assert.ok(!err, err);
                assert.ok(result);
                assert.ok(result.KeyIdentifier);
                assert.ok(result.CiperValue0);
                assert.ok(result.CiperValue1);
                done();
            });
        });
    });

    describe("Office 365 Authentication", function () {
        var settings,
            dynamics;

        beforeEach(function () {
            settings = settingsForMicrosoftOnlineAuth;
            dynamics = new Dynamics(settings);
        });

        it("Should fail with invalid credentials", function (done) {
            dynamics.Authenticate({username: "invalid"}, function (err, result) {
                assert.ok(err);
                assert.ok(!result);
                done();
            });
        });

        it("Should authenticate OK", function (done) {
            dynamics.Authenticate({}, function (err, result) {
                assert.ok(!err);
                assert.ok(result);
                assert.ok(result.KeyIdentifier);
                assert.ok(result.CiperValue0);
                assert.ok(result.CiperValue1);
                done();
            });
        });
    });

    var shouldFailDeletionWithInvalidId = function (dynamics, done) {
        var options = {};
        options.EntityName = 'lead';
        options.id = '0f993360-d987-43f7-8995-ab5ffb50a43f';

        dynamics.Authenticate({}, function (err, result) {
            assert.ok(!err);
            assert.ok(result);

            dynamics.Delete(options, function (err2, result2) {
                assert.ok(err2, err2);
                assert.ok(!result2);
                assert.equal(err2.message, "Lead With Id = " + options.id + " Does Not Exist");
                done();
            });
        });
    },

        shouldCreateALeadAndThenDeleteIt = function (dynamics, done) {
            var options = {};
            options.LogicalName = 'lead';
            options.Attributes = [ { key: 'lastname', value : 'Doe'},
                { key: 'firstname', value : 'John'}];

            dynamics.Authenticate({}, function (err, result) {
                assert.ok(!err);
                assert.ok(result);

                dynamics.Create(options, function (err2, result2) {
                    assert.ok(!err2, err2);
                    assert.ok(result2);

                    options = {};
                    options.EntityName = 'lead';
                    options.id = result2.Envelope.Body.CreateResponse.CreateResult;

                    dynamics.Delete(options, function (err3, result3) {
                        assert.ok(!err3, err3);
                        assert.ok(result3);
                        done();
                    });
                });
            });
        };

    describe("Method execution with LiveId Auth", function () {
        var settings,
            dynamics;

        before(function () {
            settings = settingsForLiveIdAuth;
            dynamics = new Dynamics(settings);
        });

        it("Should fail deletion with invalid id", function (done) {
            shouldFailDeletionWithInvalidId(dynamics, done);
        });

        it("Should Create a Lead and then delete it", function (done) {
            shouldCreateALeadAndThenDeleteIt(dynamics, done);
        });

        it("Should retrieve multiple results", function (done) {
            dynamics.Authenticate({}, function (err, result) {
                assert.ok(!err);
                assert.ok(result);

                var options = {EntityName: "account", 
                    ColumnSet: ["accountid", "name"],
                    Criteria: {
                        Conditions: {
                            FilterOperators: ["And"]
                        }
                    }
                };

                dynamics.RetrieveMultiple(options, function (err2, result2) {
                    assert.ok(!err2, err2);
                    assert.ok(result2);

                    var entities = result2.Envelope
                        .Body.RetrieveMultipleResponse
                        .RetrieveMultipleResult.Entities.Entity;

                    assert.ok(entities.length > 0);
                    assert.equal(entities[0].Attributes
                        .KeyValuePairOfstringanyType.length, 2); //Entity with 2 attributes, accountid and name

                    done();
                });
            });
        });
    });

    describe("Method execution with MicrosoftOnline Auth", function () {
        var settings,
            dynamics;

        before(function () {
            settings = settingsForMicrosoftOnlineAuth;
            dynamics = new Dynamics(settings);
        });

        it("Should fail deletion with invalid id", function (done) {
            shouldFailDeletionWithInvalidId(dynamics, done);
        });

        it("Should Create a Lead and then delete it", function (done) {
            shouldCreateALeadAndThenDeleteIt(dynamics, done);
        });
    });
});
