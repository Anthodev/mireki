const assert = require("node:assert/strict");
const { createMediaObserver } = require("../content/media-observer.js");

function element(title, paused = false) {
  const handlers = new Map();
  return {
    tagName: "VIDEO", currentTime: 10, duration: 100, paused, ended: false, isConnected: true,
    parentElement: null,
    getAttribute(name) { return name === "title" ? title : null; },
    getBoundingClientRect() { return { width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100 }; },
    querySelectorAll() { return []; },
    addEventListener(name, handler) { handlers.set(name, handler); },
    removeEventListener(name) { handlers.delete(name); },
    fire(name) { handlers.get(name)?.({ type: name }); },
    handlers,
  };
}

const first = element("YouTube old player");
let roots = [first];
let mutationCallback;
const document = {
  title: "YouTube",
  documentElement: {},
  defaultView: { innerHeight: 800, innerWidth: 1200, getComputedStyle: () => ({}) },
  querySelectorAll: () => roots,
};
class FakeMutationObserver {
  constructor(callback) { mutationCallback = callback; }
  observe() {}
  disconnect() {}
}
const messages = [];
let metadata = { title: "  Media Session title  ", artist: "Channel", album: "Series" };
const navigator = { mediaSession: { get metadata() { return metadata; } } };
let heartbeatCallback;
let now = 0;
const observer = createMediaObserver({
  document, navigator, MutationObserver: FakeMutationObserver,
  sendMessage: (message) => messages.push(message), now: () => now,
  setInterval: (callback) => { heartbeatCallback = callback; return 1; }, clearInterval: () => {},
}).start();
assert.equal(messages.at(-1).media.title, "Media Session title");
assert.equal(messages.at(-1).media.artist, "Channel");
assert.equal(messages.at(-1).media.album, "Series");

first.fire("timeupdate");
first.fire("timeupdate");
assert.equal(messages.length, 2, "timeupdate is throttled");
now = 1_000;
first.fire("timeupdate");
assert.equal(messages.length, 3);

const replacement = element("YouTube replacement");
metadata = null;
first.isConnected = false;
roots = [replacement];
mutationCallback([{ removedNodes: [first], addedNodes: [replacement] }]);
assert.equal(messages.at(-1).media.title, "YouTube replacement", "dynamic player replacement is observed");
assert.equal(first.handlers.size, 0, "removed player listeners are detached");
const beforeHeartbeat = messages.length;
metadata = { title: "Next session title", artist: "Next channel", album: "Next series" };
heartbeatCallback();
assert.equal(messages.length, beforeHeartbeat + 1, "heartbeat resends observation after background restart");
assert.equal(messages.at(-1).media.title, "Next session title", "heartbeat picks up Media Session metadata changes");
assert.equal(messages.at(-1).media.artist, "Next channel");

replacement.isConnected = false;
roots = [];
mutationCallback([{ removedNodes: [replacement], addedNodes: [] }]);
assert.equal(messages.at(-1).media, null, "media removal emits empty state");
observer.stop();
console.log("media observer checks: OK");
