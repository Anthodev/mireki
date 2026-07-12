const assert = require("node:assert/strict");
const { resultNotice } = require("../options/options-status.js");
assert.equal(resultNotice({ ok: true, status: { revocationFailed: true } }), "Disconnected locally, but remote access could not be revoked. Reconnect or retry later.");
assert.equal(resultNotice({ ok: true, status: { revocationFailed: false } }), "Account settings updated.");
assert.equal(resultNotice({ ok: false, error: "Authentication failed" }), "Authentication failed");
assert.equal(resultNotice({ ok: false, error: "<token>" }), "Authentication failed.");
console.log("options status checks: OK");
