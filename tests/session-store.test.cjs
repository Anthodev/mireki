const assert = require("node:assert/strict");
const { SessionStore } = require("../shared/session-store.js");

let time = 1_000;
const store = new SessionStore({ extensionId: "mireki@test", now: () => time, staleMs: 30_000 });
const media = (title, state = "paused") => ({
  kind: "video", title, artist: null, album: null,
  currentTime: 30, duration: 120, state, progress: 25,
});
const sender = (tabId, frameId = 0, url = `https://site${tabId}.crunchyroll.com/watch`) => ({
  id: "mireki@test", frameId, url, tab: { id: tabId, url },
});
const observe = (value, tabSender) => store.ingest({
  type: "media:observation", media: value, pageTitle: "Page",
}, tabSender);

assert.equal(observe(media("one"), sender(1)), true);
assert.equal(store.nextExpiry(), 31_000, "first frame schedules exact stale deadline");
time++;
assert.equal(observe(media("two"), sender(2)), true);
assert.equal(store.nextExpiry(), 31_000, "earliest frame remains next deadline");
assert.equal(store.status().media.title, "two", "latest paused media wins");
assert.equal(observe(media("playing", "playing"), sender(1, 2)), true);
assert.equal(store.status().media.title, "playing", "playing media wins across tabs and frames");
assert.equal(store.status().source.hostname, "site1.crunchyroll.com");
time++;
assert.equal(observe(media("other playing", "playing"), sender(2, 3)), true);
assert.equal(store.status().media.title, "playing", "selected playing frame stays sticky despite competing updates");
assert.equal(observe(media("now paused"), sender(1, 2)), true);
assert.equal(store.status().media.title, "other playing", "winner switches when selected source stops playing");

assert.equal(observe(media("bad"), { ...sender(3), id: "other" }), false, "reject foreign sender");
assert.equal(observe(media("bad"), { id: "mireki@test", frameId: 0, url: "https://site.test" }), false, "reject extension-page spoof without tab");
assert.equal(observe(media("bad"), sender(3, 0, "file:///tmp/video")), false, "reject non-HTTPS sender");
assert.equal(observe(media("bad"), sender(3, 0, "https://unrelated.test/watch")), false, "reject arbitrary HTTPS sender");
assert.equal(observe(media("bad"), sender(3, 0, "https://api.trakt.tv/watch")), false, "reject Trakt API origin as observation source");
assert.equal(observe(media("bad"), { ...sender(3), url: "https://unrelated.test/embed" }), false, "reject non-provider frame inside provider tab");
assert.equal(observe({ ...media("bad"), progress: 101 }, sender(3)), false, "reject invalid schema");
assert.equal(observe({ ...media("bad"), artist: "x".repeat(301) }, sender(3)), false, "reject oversized artist");
assert.equal(observe({ ...media("bad"), album: 42 }, sender(3)), false, "reject non-string album");

assert.equal(observe(null, sender(1, 2)), true, "explicit empty removes frame");
assert.equal(observe(null, sender(2, 3)), true, "explicit empty removes selected frame");
assert.equal(store.status().media.title, "two");
store.removeTab(2);
assert.equal(store.status().media.title, "one", "tab removal clears every frame");
time += 30_001;
assert.equal(store.status().kind, "empty", "stale observations expire");
let expiryTime = 1_000;
const expiryStore = new SessionStore({ extensionId: "mireki@test", now: () => expiryTime, staleMs: 30_000 });
expiryStore.ingest({ type: "media:observation", media: media("early"), pageTitle: "Page" }, sender(10));
expiryTime = 2_000;
expiryStore.ingest({ type: "media:observation", media: media("later"), pageTitle: "Page" }, sender(11));
expiryTime = 31_000;
assert.equal(expiryStore.status().media.title, "later", "earliest stale frame expires independently");
assert.equal(expiryStore.nextExpiry(), 32_000, "next surviving frame becomes alarm deadline");
console.log("session store checks: OK");
