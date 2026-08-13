const assert = require("node:assert/strict");
const { formatTime, renderState } = require("../popup/popup-state.js");

const element = () => ({
  hidden: false, textContent: "", value: 0, attributes: {}, dataset: {},
  getAttribute(name) { return this.attributes[name] || null; },
  setAttribute(name, value) { this.attributes[name] = value; },
  removeAttribute(name) { delete this.attributes[name]; },
});
const elements = {
  message: element(), details: element(), artwork: element(), title: element(), source: element(), status: element(), sync: element(), syncLabel: element(),
  optionsButton: element(), correctionButton: element(), correctionAction: element(), controlsButton: element(), time: element(), progress: element(), bar: element(),
};
elements.optionsButton.hidden = true;
elements.correctionButton.hidden = true;
elements.controlsButton.hidden = true;

assert.equal(formatTime(65), "1:05");
assert.equal(formatTime(3661), "1:01:01");
renderState({ kind: "empty" }, elements);
assert.match(elements.message.textContent, /No media/);
assert.equal(elements.optionsButton.hidden, false, "options button is shown with the empty state");
assert.equal(elements.correctionButton.hidden, true, "manual correction stays contextual to detected media");
assert.equal(elements.controlsButton.hidden, false, "scrobbling controls remain available without detected media");
renderState({ kind: "error" }, elements);
assert.match(elements.message.textContent, /unavailable/);
assert.equal(elements.optionsButton.hidden, true, "options button stays hidden for errors");
assert.equal(elements.artwork.getAttribute("src"), null);
renderState({ kind: "media", media: {
  kind: "video", title: "<img onerror=alert(1)>", artist: "Channel <b>name</b>", album: null, artwork: "https://img.test/cover.jpg",
  currentTime: 30, duration: 120, state: "playing", progress: 25,
}, source: { pageTitle: "Unsafe <b>page</b>", hostname: "example.test" }, sync: { state: "scrobbling" } }, elements);
assert.equal(elements.title.textContent, "<img onerror=alert(1)>");
assert.equal(elements.status.textContent, "Playing");
assert.equal(elements.syncLabel.textContent, "Scrobbling");
assert.equal(elements.sync.dataset.state, "scrobbling");
assert.equal(elements.sync.getAttribute("aria-label"), "Trakt synchronization: Scrobbling");
assert.equal(elements.source.textContent, "Channel <b>name</b>");
assert.equal(elements.progress.textContent, "25.0 %");
assert.equal(elements.bar.value, 25);
assert.equal(elements.details.hidden, false);
assert.equal(elements.optionsButton.hidden, true, "options button stays hidden during playback");
assert.equal(elements.correctionButton.hidden, false);
assert.equal(elements.correctionAction.textContent, "Wrong match?");
assert.equal(elements.correctionButton.dataset.emphasis, "false");
assert.equal(elements.artwork.getAttribute("src"), "https://img.test/cover.jpg");
assert.equal(elements.artwork.hidden, false);

renderState({ kind: "media", media: {
  kind: "video", title: "Completed", artist: null, album: null, artwork: null,
  currentTime: 90, duration: 100, state: "playing", progress: 90,
}, source: { pageTitle: "Completed", hostname: "example.test" }, sync: { state: "synced" } }, elements);
assert.equal(elements.syncLabel.textContent, "Watched");
assert.equal(elements.sync.dataset.state, "synced");
assert.equal(elements.sync.getAttribute("aria-label"), "Trakt synchronization: Watched");
assert.equal(elements.correctionAction.textContent, "Wrong match?");

renderState({ kind: "media", media: {
  kind: "video", title: "Unknown episode", artist: "Show", album: null, artwork: null,
  currentTime: 30, duration: 120, state: "playing", progress: 25,
}, source: { hostname: "example.test" }, sync: { state: "ambiguous" } }, elements);
assert.equal(elements.correctionAction.textContent, "Find on Trakt");
assert.equal(elements.correctionButton.dataset.emphasis, "true");
renderState({ kind: "media", media: {
  kind: "video", title: "Ignored episode", artist: "Show", album: null, artwork: null,
  currentTime: 30, duration: 120, state: "playing", progress: 25,
}, source: { hostname: "www.netflix.com" }, sync: { state: "ignored" } }, elements);
assert.equal(elements.syncLabel.textContent, "Ignored");
assert.equal(elements.sync.getAttribute("aria-label"), "Trakt synchronization: Ignored");

renderState({ kind: "media", media: {
  kind: "video", title: "Provider disabled", artist: "Show", album: null, artwork: null,
  currentTime: 30, duration: 120, state: "playing", progress: 25,
}, source: { hostname: "www.netflix.com" }, sync: { state: "providerDisabled" } }, elements);
assert.equal(elements.syncLabel.textContent, "Provider off");

renderState({ kind: "media", media: {
  kind: "video", title: "Corrected", artist: null, album: null, artwork: null,
  currentTime: 30, duration: 120, state: "playing", progress: 25,
}, source: { hostname: "example.test" }, sync: { state: "scrobbling" }, manualMatch: {
  display: { type: "movie", title: "Arrival", year: 2016 },
} }, elements);
assert.equal(elements.correctionAction.textContent, "Edit manual match");

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
