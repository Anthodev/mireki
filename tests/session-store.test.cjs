const assert = require("node:assert/strict");
const { SessionStore } = require("../shared/session-store.js");

let time = 1_000;
const store = new SessionStore({ extensionId: "mireki@test", now: () => time, staleMs: 30_000 });
const media = (title, state = "paused") => ({
  kind: "video", title, artist: null, album: null,
  currentTime: 30, duration: 120, state, progress: 25,
});
const sender = (tabId, frameId = 0, url = `https://site${tabId}.test/watch`) => ({
  id: "mireki@test", frameId, url, tab: { id: tabId, url },
});
const observe = (value, tabSender) => store.ingest({
  type: "media:observation", media: value, pageTitle: "Page",
}, tabSender);

assert.equal(observe(media("one"), sender(1)), true);
time++;
assert.equal(observe(media("two"), sender(2)), true);
assert.equal(store.status().media.title, "two", "latest paused media wins");
assert.equal(observe(media("playing", "playing"), sender(1, 2)), true);
assert.equal(store.status().media.title, "playing", "playing media wins across tabs and frames");
assert.equal(store.status().source.hostname, "site1.test");

assert.equal(observe(media("bad"), { ...sender(3), id: "other" }), false, "reject foreign sender");
assert.equal(observe(media("bad"), sender(3, 0, "file:///tmp/video")), false, "reject non-HTTP sender");
assert.equal(observe({ ...media("bad"), progress: 101 }, sender(3)), false, "reject invalid schema");
assert.equal(observe({ ...media("bad"), artist: "x".repeat(301) }, sender(3)), false, "reject oversized artist");
assert.equal(observe({ ...media("bad"), album: 42 }, sender(3)), false, "reject non-string album");

assert.equal(observe(null, sender(1, 2)), true, "explicit empty removes frame");
assert.equal(store.status().media.title, "two");
store.removeTab(2);
assert.equal(store.status().media.title, "one", "tab removal clears every frame");
time += 30_001;
assert.equal(store.status().kind, "empty", "stale observations expire");
console.log("session store checks: OK");
