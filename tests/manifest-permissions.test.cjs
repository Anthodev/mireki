const assert = require("node:assert/strict");
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync("manifest.json"));
const { PROVIDER_HOSTS } = require("../shared/session-store.js");
const expected = [
  "https://*.animationdigitalnetwork.com/*",
  "https://*.crunchyroll.com/*",
  "https://*.disneyplus.com/*",
  "https://*.hbomax.com/*",
  "https://*.hulu.com/*",
  "https://*.max.com/*",
  "https://*.netflix.com/*",
  "https://*.paramountplus.com/*",
  "https://*.peacocktv.com/*",
  "https://*.primevideo.com/*",
  "https://tv.apple.com/*",
];
assert.deepEqual(manifest.host_permissions, [...expected, "https://api.trakt.tv/*"]);
const observedMatches = manifest.content_scripts.flatMap((entry) => entry.matches);
assert.deepEqual([...observedMatches].sort(), [...expected].sort());
assert.equal(new Set(observedMatches).size, expected.length, "provider matches are declared exactly once");
assert.ok(manifest.content_scripts.every((entry) => entry.all_frames === true));
const netflixScript = manifest.content_scripts.find((entry) => entry.matches.includes("https://*.netflix.com/*"));
assert.deepEqual(netflixScript.matches, ["https://*.netflix.com/*"]);
assert.ok(netflixScript.js.includes("providers/netflix.js"), "Netflix adapter loads on Netflix");
assert.ok(manifest.content_scripts.filter((entry) => entry !== netflixScript)
  .every((entry) => !entry.js.includes("providers/netflix.js")), "Netflix adapter stays isolated from other providers");
assert.ok(manifest.permissions.includes("alarms"), "one-shot alarm expires stale scrobble state while popup is closed");
assert.deepEqual(PROVIDER_HOSTS, expected.filter((pattern) => pattern.includes("*.")).map((pattern) => new URL(pattern.replace("*.", "www.")).hostname.slice(4)), "runtime provider allowlist stays synchronized");
assert.equal(expected.some((pattern) => pattern.includes("<all_urls>") || pattern.startsWith("http://") || pattern === "https://*/*"), false);
assert.equal(expected.some((pattern) => pattern.includes("amazon.")), false, "retail Amazon domains stay excluded");
const scripts = manifest.background.scripts;
assert.ok(scripts.indexOf("background/auth-background.js") < scripts.indexOf("background/scrobble-background.js"));
assert.ok(scripts.indexOf("background/scrobble-background.js") < scripts.indexOf("background/background.js"), "controller initializes before sole observation listener");
console.log("manifest permission checks: OK");
