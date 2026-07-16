const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("shared/webextension-api.js", "utf8");

let firefoxListener;
const firefoxBrowser = { runtime: { onMessage: { addListener(listener) { firefoxListener = listener; } } } };
const firefoxContext = vm.createContext({ browser: firefoxBrowser });
vm.runInContext(source, firefoxContext);
const nativeListener = () => Promise.resolve("native");
firefoxContext.MirekiWebExtension.addMessageListener(nativeListener);
assert.equal(firefoxListener, nativeListener, "Firefox keeps native Promise listener semantics");

let chromeListener;
const chromeApi = { runtime: { onMessage: { addListener(listener) { chromeListener = listener; } } } };
const chromeContext = vm.createContext({ chrome: chromeApi });
vm.runInContext(source, chromeContext);
assert.equal(chromeContext.browser, chromeApi, "Chrome receives the shared browser namespace");
chromeContext.MirekiWebExtension.addMessageListener(() => Promise.resolve({ accepted: true }));
let response;
assert.equal(chromeListener({}, {}, (value) => { response = value; }), true,
  "Chrome keeps the message channel open for Promise responses");

(async () => {
  await Promise.resolve();
  assert.equal(response.accepted, true);
  console.log("WebExtension API compatibility checks: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
