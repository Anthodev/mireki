const assert = require("node:assert/strict");

global.MirekiSessions = require("../shared/session-store.js");
let onMessage;
global.browser = {
  runtime: {
    id: "mireki@test",
    onMessage: { addListener(listener) { onMessage = listener; } },
  },
  tabs: {
    onRemoved: { addListener() {} },
    onUpdated: { addListener() {} },
  },
};
require("../background/background.js");

(async () => {
  const statusResponse = onMessage({ type: "status:get" }, { id: browser.runtime.id });
  assert.equal(typeof statusResponse?.then, "function", "Firefox responses must be promises");
  assert.deepEqual(await statusResponse, { kind: "empty" });

  const url = "https://www.youtube.com/watch?v=test";
  const observationResponse = onMessage({
    type: "media:observation",
    media: { kind: "video", title: "Video", artist: "Channel", album: null, currentTime: 5, duration: 10, state: "playing", progress: 50 },
    pageTitle: "YouTube",
  }, { id: browser.runtime.id, frameId: 0, url, tab: { id: 1, url } });
  assert.deepEqual(await observationResponse, { accepted: true });
  assert.equal((await onMessage({ type: "status:get" }, { id: browser.runtime.id })).media.title, "Video");
  assert.equal(onMessage({ type: "status:get" }, { id: "other" }), undefined);
  console.log("background messaging checks: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
