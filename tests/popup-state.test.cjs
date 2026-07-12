const assert = require("node:assert/strict");
const { formatTime, renderState } = require("../popup/popup-state.js");

const element = () => ({
  hidden: false, textContent: "", value: 0, attributes: {},
  getAttribute(name) { return this.attributes[name] || null; },
  setAttribute(name, value) { this.attributes[name] = value; },
  removeAttribute(name) { delete this.attributes[name]; },
});
const elements = {
  message: element(), details: element(), artwork: element(), title: element(), source: element(), status: element(),
  time: element(), progress: element(), bar: element(),
};

assert.equal(formatTime(65), "1:05");
assert.equal(formatTime(3661), "1:01:01");
renderState({ kind: "empty" }, elements);
assert.match(elements.message.textContent, /No media/);
renderState({ kind: "error" }, elements);
assert.match(elements.message.textContent, /unavailable/);
assert.equal(elements.artwork.getAttribute("src"), null);
renderState({ kind: "media", media: {
  kind: "video", title: "<img onerror=alert(1)>", artist: "Channel <b>name</b>", album: null, artwork: "https://img.test/cover.jpg",
  currentTime: 30, duration: 120, state: "playing", progress: 25,
}, source: { pageTitle: "Unsafe <b>page</b>", hostname: "example.test" } }, elements);
assert.equal(elements.title.textContent, "<img onerror=alert(1)>");
assert.equal(elements.status.textContent, "Playing");
assert.equal(elements.source.textContent, "Channel <b>name</b>");
assert.equal(elements.progress.textContent, "25.0 %");
assert.equal(elements.bar.value, 25);
assert.equal(elements.details.hidden, false);
assert.equal(elements.artwork.getAttribute("src"), "https://img.test/cover.jpg");
assert.equal(elements.artwork.hidden, false);

renderState({ kind: "media", media: {
  kind: "video", title: "Video", artist: null, album: null,
  currentTime: 0, duration: null, state: "paused", progress: null,
}, source: { pageTitle: "Video", hostname: "youtube.com" } }, elements);
assert.equal(elements.source.textContent, "youtube.com", "hostname replaces duplicate page title");

renderState({ kind: "media", media: {
  kind: "video", title: "Video", artist: " Video ", album: null,
  currentTime: 0, duration: null, state: "paused", progress: null,
}, source: { pageTitle: "Video", hostname: "youtube.com" } }, elements);
assert.equal(elements.source.textContent, "youtube.com", "duplicate artist is suppressed");
renderState({ kind: "media", media: {
  kind: "video", title: null, artist: "Untitled video", album: null,
  currentTime: 0, duration: null, state: "paused", progress: null,
}, source: { hostname: "youtube.com" } }, elements);
assert.equal(elements.title.textContent, "Untitled video");
assert.equal(elements.source.textContent, "youtube.com", "source is deduplicated against displayed fallback title");
console.log("popup state checks: OK");
