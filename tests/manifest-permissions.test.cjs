const assert = require("node:assert/strict");
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync("manifest.json"));
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
  "https://*.youtube.com/*",
  "https://*.youtube-nocookie.com/*",
  "https://tv.apple.com/*",
];
assert.deepEqual(manifest.host_permissions, expected);
assert.deepEqual(manifest.content_scripts[0].matches, expected);
assert.equal(expected.some((pattern) => pattern.includes("<all_urls>") || pattern.startsWith("http://") || pattern === "https://*/*"), false);
assert.equal(expected.some((pattern) => pattern.includes("amazon.")), false, "retail Amazon domains stay excluded");
console.log("manifest permission checks: OK");
