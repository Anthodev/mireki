const assert = require("node:assert/strict");

global.MirekiSessions = require("../shared/session-store.js");
let onMessage;
let onRemoved;
let onUpdated;
let onAlarm;
let time = 1_000;
const realDateNow = Date.now;
Date.now = () => time;
let hold = false;
let release;
const handled = [];
const alarmDeadlines = [];
let alarmClears = 0;
global.MirekiScrobble = {
  handle(status) {
    handled.push(status);
    if (!hold) return Promise.resolve();
    hold = false;
    return new Promise((resolve) => { release = resolve; });
  },
  statusFor() { return { state: "scrobbling" }; },
};
global.browser = {
  runtime: { id: "mireki@test", onMessage: { addListener(listener) { onMessage = listener; } } },
  tabs: {
    onRemoved: { addListener(listener) { onRemoved = listener; } },
    onUpdated: { addListener(listener) { onUpdated = listener; } },
  },
  alarms: {
    async create(_name, info) { alarmDeadlines.push(info.when); }, async clear() { alarmClears++; },
    onAlarm: { addListener(listener) { onAlarm = listener; } },
  },
};
require("../shared/webextension-api.js");
require("../background/background.js");
const media = (title, state = "playing") => ({ kind: "video", title, artist: null, album: null, artwork: null, currentTime: 5, duration: 10, state, progress: 50 });
const sender = (tabId, frameId = 0) => { const url = `https://site${tabId}.crunchyroll.com/watch`; return { id: browser.runtime.id, frameId, url, tab: { id: tabId, url } }; };
const observe = (title, tabId, state = "playing", frameId = 0) => onMessage({ type: "media:observation", media: media(title, state), pageTitle: title }, sender(tabId, frameId));

(async () => {
  assert.deepEqual(await onMessage({ type: "status:get" }, { id: browser.runtime.id }), { kind: "empty" });
  hold = true;
  const response = observe("First", 1);
  let settled = false;
  response.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false, "message response awaits controller work");
  release();
  assert.deepEqual(await response, { accepted: true });
  assert.equal(handled.at(-1).source.tabId, 1);
  assert.equal(alarmDeadlines.at(-1), 31_000, "background schedules exact earliest expiry");

  await observe("Competing", 2);
  assert.equal(handled.at(-1).source.tabId, 1, "competing playing tab cannot bypass sticky global winner");
  assert.equal(handled.at(-1).media.title, "First");
  await observe("First paused", 1, "paused");
  assert.equal(handled.at(-1).source.tabId, 2, "controller receives replacement only after selected winner pauses");
  assert.equal(handled.at(-1).media.title, "Competing");

  const status = await onMessage({ type: "status:get" }, { id: browser.runtime.id });
  assert.equal(status.sync.state, "scrobbling");
  await onRemoved(2);
  assert.equal(handled.at(-1).source.tabId, 1, "tab removal updates selected controller state");
  time += 30_001;
  await onAlarm({ name: "mireki:session-expiry" });
  assert.equal(handled.at(-1).kind, "empty", "alarm expires stale selected session without another observation");
  assert.ok(alarmClears > 0, "background clears alarm after final session expires");
  await onUpdated(1, { status: "loading" });
  assert.equal(handled.at(-1).kind, "empty", "navigation keeps selected controller state empty");
  assert.equal(onMessage({ type: "status:get" }, { id: "other" }), undefined);
  Date.now = realDateNow;
  console.log("background messaging checks: OK");
})().catch((error) => { Date.now = realDateNow; console.error(error); process.exitCode = 1; });
