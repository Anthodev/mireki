const assert = require("node:assert/strict");
const {
  normalizeMedia,
  extractMediaSessionMetadata,
  selectMedia,
  toPopupState,
} = require("../playback/media-snapshot.js");

const media = (overrides = {}) => ({
  tagName: "VIDEO",
  currentTime: 30,
  duration: 120,
  paused: true,
  ended: false,
  readyState: 4,
  visible: true,
  title: "Episode 1",
  ...overrides,
});

assert.equal(selectMedia([
  media({ tagName: "AUDIO", paused: false }),
  media({ paused: false, visible: false }),
  media({ paused: false }),
]).title, "Episode 1");
assert.equal(selectMedia([
  media({ tagName: "AUDIO", paused: false, title: "audio" }),
  media({ paused: true, title: "paused" }),
]).title, "audio");
assert.equal(selectMedia([
  media({ duration: Number.NaN, title: "invalid" }),
  media({ title: "valid" }),
]).title, "valid");
assert.equal(selectMedia([]), null);
assert.equal(selectMedia([
  media({ ended: true, title: "ended" }),
  media({ paused: true, ended: false, title: "paused" }),
]).title, "paused", "paused media outranks ended media regardless of DOM order");
assert.equal(selectMedia([media({ duration: NaN }), media({ duration: Infinity })]), null);
assert.equal(selectMedia([media({ paused: false, duration: NaN, title: "live" })]).title, "live");
assert.equal(selectMedia([
  media({ paused: false, visible: false, title: "offscreen-video" }),
  media({ tagName: "AUDIO", paused: false, title: "playing-audio" }),
]).title, "offscreen-video");

assert.deepEqual(normalizeMedia(media()), {
  kind: "video", title: "Episode 1", artist: null, album: null, artwork: null,
  currentTime: 30, duration: 120, state: "paused", progress: 25,
});
assert.deepEqual(extractMediaSessionMetadata({ mediaSession: { metadata: {
  title: "  Session title  ", artist: "  Channel  ", album: "  Series  ",
} } }), { title: "Session title", artist: "Channel", album: "Series", artwork: null });
assert.deepEqual(extractMediaSessionMetadata({ mediaSession: { metadata: {
  title: " ", artist: 42, album: null,
} } }), { title: null, artist: null, album: null, artwork: null });
assert.equal(extractMediaSessionMetadata({ mediaSession: {
  metadata: { title: "x".repeat(301) },
} }).title.length, 300);
assert.equal(extractMediaSessionMetadata({ mediaSession: { metadata: { artwork: [
  { src: "/small.jpg", sizes: "96x96" }, { src: "https://img.test/large.jpg", sizes: "512x512" },
] } } }, "https://site.test/watch").artwork, "https://img.test/large.jpg");
assert.equal(normalizeMedia({ ...media(), poster: "/poster.jpg" }, {}, "https://site.test/watch").artwork, "https://site.test/poster.jpg");
assert.equal(normalizeMedia({ ...media(), poster: "http://unsafe.test/a.jpg" }, {}, "https://site.test/watch").artwork, null);
assert.equal(normalizeMedia(media(), { artwork: "https://img.test/session.jpg" }).artwork, "https://img.test/session.jpg");
assert.equal(normalizeMedia(media({ currentTime: 999 })).progress, 100);
assert.equal(normalizeMedia(media({ duration: Infinity })).duration, null);
assert.equal(normalizeMedia(media({ duration: Infinity })).progress, null);
assert.equal(normalizeMedia(media({ currentTime: 102, duration: 120 })).progress, 85);
assert.equal("watched" in normalizeMedia(media({ currentTime: 102, duration: 120 })), false,
  "snapshot normalization stays independent from 85% completion policy");
assert.equal(normalizeMedia(media({ paused: false })).state, "playing");
assert.equal(normalizeMedia(media({ ended: true })).state, "ended");

assert.equal(toPopupState(null).kind, "empty");
assert.equal(toPopupState(normalizeMedia(media())).kind, "media");
assert.equal(toPopupState(undefined, new Error("denied")).kind, "error");
console.log("media snapshot checks: OK");
