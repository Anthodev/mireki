const assert = require("node:assert/strict");

global.MirekiAuthConfig = Object.freeze({ oauthBrokerUrl: "", traktClientId: "" });
global.MirekiTokenStore = require("../auth/token-store.js");
global.MirekiTraktAuth = require("../services/trakt-auth.js");
global.MirekiScrobbleController = require("../playback/scrobble-controller.js");
let listener;
const values = {};
global.browser = {
  runtime: {
    id: "mireki@test",
    getURL: (path) => `moz-extension://mireki/${path}`,
    onMessage: { addListener(value) { listener = value; } },
  },
  storage: { local: {
    async get(key) { return { [key]: values[key] }; },
    async set(value) { Object.assign(values, value); },
    async remove(key) { delete values[key]; },
  } },
  identity: {},
};
require("../shared/webextension-api.js");
let resetFinished = false;
let resumed = false;
global.MirekiScrobble = { async reset() { await Promise.resolve(); resetFinished = true; }, resume() { resumed = true; } };
global.fetch = async () => { throw new Error("unexpected fetch"); };
global.crypto = require("node:crypto").webcrypto;
require("../background/auth-background.js");

(async () => {
  const optionsSender = {
    id: browser.runtime.id,
    tab: { id: 7, url: browser.runtime.getURL("options/options.html") },
  };
  const services = await listener({ type: "auth:list" }, optionsSender);
  assert.deepEqual(services, [{ id: "trakt", label: "Trakt", available: false, connected: false, expiresAt: null, revocationFailed: false }]);
  assert.equal(listener({ type: "auth:list" }, {
    id: browser.runtime.id, url: "https://example.test/", tab: { id: 8 },
  }), undefined, "content scripts cannot query auth state");
  values["scrobble.completed.v1"] = { "movie:42": 1 };
  const disconnected = await listener({ type: "auth:disconnect", serviceId: "trakt" }, optionsSender);
  assert.equal(disconnected.ok, true);
  assert.equal(resetFinished, true, "disconnect awaits controller reset before deletion");
  assert.equal(values["scrobble.completed.v1"], undefined, "disconnect deletes persisted scrobble state");
  assert.equal(resumed, false, "disconnect leaves controller suspended");
  console.log("auth background checks: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
