const assert = require("node:assert/strict");
const { isValidArtworkUrl, normalizeArtworkUrl } = require("../shared/artwork-url.js");
assert.equal(normalizeArtworkUrl("/cover.jpg", "https://media.test/watch"), "https://media.test/cover.jpg");
assert.equal(isValidArtworkUrl("https://media.test/cover.jpg"), true);
for (const value of ["http://media.test/a.jpg", "data:image/png,x", "javascript:alert(1)", "https://user:pass@media.test/a.jpg", "\nhttps://media.test/a.jpg", "x".repeat(2049)]) assert.equal(normalizeArtworkUrl(value, "https://media.test"), null);
console.log("artwork URL checks: OK");
