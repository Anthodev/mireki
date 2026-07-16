const assert = require("node:assert/strict");
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync("manifest.json"));
const { PROVIDER_HOSTS } = require("../shared/session-store.js");
const expected = [
  "https://*.crunchyroll.com/*",
  "https://*.netflix.com/*",
  "https://*.primevideo.com/*",
];
assert.deepEqual(manifest.host_permissions, [...expected, "https://api.trakt.tv/*"]);
const observedMatches = manifest.content_scripts.flatMap((entry) => entry.matches);
assert.deepEqual([...observedMatches].sort(), [...expected].sort());
assert.equal(new Set(observedMatches).size, expected.length, "provider matches are declared exactly once");
assert.ok(manifest.content_scripts.every((entry) => entry.all_frames === true));
const netflixScript = manifest.content_scripts.find((entry) => entry.matches.includes("https://*.netflix.com/*"));
assert.deepEqual(netflixScript.matches, ["https://*.netflix.com/*"]);
assert.ok(netflixScript.js.includes("providers/netflix.js"), "Netflix adapter loads on Netflix");
assert.ok(netflixScript.js.indexOf("shared/episode-label.js") < netflixScript.js.indexOf("providers/netflix.js"),
  "episode parser loads before Netflix adapter");
assert.ok(manifest.content_scripts.filter((entry) => entry !== netflixScript)
  .every((entry) => !entry.js.includes("providers/netflix.js")), "Netflix adapter stays isolated from other providers");
const primeScript = manifest.content_scripts.find((entry) => entry.matches.includes("https://*.primevideo.com/*"));
assert.deepEqual(primeScript.matches, ["https://*.primevideo.com/*"]);
assert.ok(primeScript.js.includes("providers/prime-video.js"), "Prime Video adapter loads on Prime Video");
assert.ok(primeScript.js.indexOf("shared/episode-label.js") < primeScript.js.indexOf("providers/prime-video.js"),
  "episode parser loads before Prime Video adapter");
assert.ok(manifest.content_scripts.filter((entry) => entry !== primeScript)
  .every((entry) => !entry.js.includes("providers/prime-video.js")), "Prime Video adapter stays isolated from other providers");
assert.ok(manifest.permissions.includes("alarms"), "one-shot alarm expires stale scrobble state while popup is closed");
assert.deepEqual(PROVIDER_HOSTS, expected.filter((pattern) => pattern.includes("*.")).map((pattern) => new URL(pattern.replace("*.", "www.")).hostname.slice(4)), "runtime provider allowlist stays synchronized");
assert.equal(expected.some((pattern) => pattern.includes("<all_urls>") || pattern.startsWith("http://") || pattern === "https://*/*"), false);
assert.equal(expected.some((pattern) => pattern.includes("amazon.")), false, "retail Amazon domains stay excluded");
const scripts = manifest.background.scripts;
assert.ok(scripts.indexOf("shared/episode-label.js") < scripts.indexOf("trakt/trakt-matcher.js"),
  "episode parser loads before Trakt matcher");
assert.ok(scripts.indexOf("shared/completion-threshold.js") < scripts.indexOf("playback/scrobble-controller.js"),
  "completion threshold contract loads before scrobble controller");
assert.ok(scripts.indexOf("background/auth-background.js") < scripts.indexOf("background/scrobble-background.js"));
assert.ok(scripts.indexOf("background/scrobble-background.js") < scripts.indexOf("background/background.js"), "controller initializes before sole observation listener");
console.log("manifest permission checks: OK");
