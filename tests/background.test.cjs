const assert = require("node:assert/strict");

global.MirekiSessions = require("../shared/session-store.js");
global.MirekiScrobbleControls = require("../playback/scrobble-controls.js");
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
const blocked = [];
const localValues = {};
const sessionValues = {};
const alarmDeadlines = [];
let alarmClears = 0;
global.MirekiScrobble = {
  handle(status, blockedState) {
    handled.push(status);
    blocked.push(blockedState);
    if (!hold) return Promise.resolve();
    hold = false;
    return new Promise((resolve) => { release = resolve; });
  },
  statusFor() { return { state: "scrobbling" }; },
};
let manualMatch = null;
const manualSelections = [];
global.MirekiManualMatch = {
  identity(status) { return status.kind === "media" ? `media:${status.media.title}` : null; },
  async get() { return manualMatch; },
  async search(query) { return [{ type: "movie", traktId: 7, title: query, year: 2026 }]; },
  async set(status, mediaKey, selection) {
    if (mediaKey !== this.identity(status)) throw new Error("Stale media");
    manualSelections.push(selection);
    manualMatch = {
      item: { type: "movie", traktId: selection.traktId },
      display: { type: "movie", title: "First corrected", showTitle: null, year: 2026, season: null, episode: null },
    };
    return manualMatch;
  },
  async remove(status, mediaKey) {
    if (mediaKey !== this.identity(status)) throw new Error("Stale media");
    manualMatch = null;
    return true;
  },
};
global.MirekiScrobble.invalidateMatch = () => {};
global.browser = {
  runtime: {
    id: "mireki@test",
    getURL: (path = "") => `moz-extension://mireki/${path}`,
    onMessage: { addListener(listener) { onMessage = listener; } },
  },
  tabs: {
    onRemoved: { addListener(listener) { onRemoved = listener; } },
    onUpdated: { addListener(listener) { onUpdated = listener; } },
  },
  alarms: {
    async create(_name, info) { alarmDeadlines.push(info.when); }, async clear() { alarmClears++; },
    onAlarm: { addListener(listener) { onAlarm = listener; } },
  },
  storage: {
    local: {
      async get(key) { return { [key]: localValues[key] }; },
      async set(update) { Object.assign(localValues, update); },
    },
    session: {
      async get(key) { return { [key]: sessionValues[key] }; },
      async set(update) { Object.assign(sessionValues, update); },
    },
  },
};
require("../shared/webextension-api.js");
require("../background/background.js");
const media = (title, state = "playing") => ({ kind: "video", title, artist: null, album: null, artwork: null, currentTime: 5, duration: 10, state, progress: 50 });
const sender = (tabId, frameId = 0) => { const url = `https://site${tabId}.crunchyroll.com/watch`; return { id: browser.runtime.id, frameId, url, tab: { id: tabId, url } }; };
const observe = (title, tabId, state = "playing", frameId = 0) => onMessage({ type: "media:observation", media: media(title, state), pageTitle: title }, sender(tabId, frameId));

(async () => {
  assert.equal((await onMessage({ type: "status:get" }, { id: browser.runtime.id })).kind, "empty");
  hold = true;
  const response = observe("First", 1);
  let settled = false;
  response.then(() => { settled = true; });
  while (!release) await Promise.resolve();
  assert.equal(settled, false, "message response awaits controller work");
  release();
  assert.deepEqual(await response, { accepted: true });
  assert.equal(handled.at(-1).source.tabId, 1);
  assert.equal(alarmDeadlines.at(-1), 31_000, "background schedules exact earliest expiry");
  const extensionSender = { id: browser.runtime.id, url: browser.runtime.getURL("popup/popup.html") };
  const search = await onMessage({ type: "manual-match:search", query: "First" }, extensionSender);
  assert.equal(search.ok, true);
  assert.equal(search.mediaKey, "media:First");
  assert.equal(search.results[0].traktId, 7);
  const correction = await onMessage({
    type: "manual-match:set",
    mediaKey: search.mediaKey,
    selection: { type: "movie", traktId: 7 },
  }, extensionSender);
  assert.equal(correction.ok, true);
  assert.deepEqual(manualSelections, [{ type: "movie", traktId: 7 }]);
  const correctedStatus = await onMessage({ type: "status:get" }, extensionSender);
  assert.equal(correctedStatus.manualMatch.display.title, "First corrected");
  assert.equal((await onMessage({ type: "manual-match:remove", mediaKey: search.mediaKey }, extensionSender)).ok, true);
  assert.equal((await onMessage({ type: "status:get" }, extensionSender)).manualMatch, null);
  assert.equal(onMessage({ type: "manual-match:search", query: "First" }, sender(1)), undefined, "content scripts cannot use manual matching");
  assert.equal((await onMessage({ type: "scrobble-controls:get" }, extensionSender)).controls.mode, "active");
  assert.equal((await onMessage({ type: "scrobble-controls:pause", duration: "15m" }, extensionSender)).controls.mode, "paused");
  assert.equal(blocked.at(-1), "paused", "temporary suspension reaches the controller immediately");
  assert.equal((await onMessage({ type: "status:get" }, extensionSender)).controls.resumeAt, 901_000);
  assert.equal((await onMessage({ type: "scrobble-controls:resume" }, extensionSender)).controls.mode, "active");
  assert.equal(blocked.at(-1), null);
  assert.equal((await onMessage({ type: "scrobble-controls:ignore-current" }, extensionSender)).controls.mode, "ignored");
  assert.equal(blocked.at(-1), "ignored");
  assert.equal((await onMessage({ type: "scrobble-controls:resume-current" }, extensionSender)).controls.mode, "active");
  assert.equal((await onMessage({ type: "scrobble-controls:set-provider", providerId: "crunchyroll", enabled: false }, extensionSender)).controls.mode, "providerDisabled");
  assert.equal((await onMessage({ type: "scrobble-controls:set-provider", providerId: "crunchyroll", enabled: true }, extensionSender)).controls.mode, "active");
  assert.equal((await onMessage({ type: "scrobble-controls:set-global", enabled: false }, extensionSender)).controls.mode, "disabled");
  assert.equal((await onMessage({ type: "scrobble-controls:set-global", enabled: true }, extensionSender)).controls.mode, "active");
  assert.equal(onMessage({ type: "scrobble-controls:pause", duration: "15m" }, sender(1)), undefined, "content scripts cannot change scrobbling controls");
  assert.deepEqual(await onMessage({ type: "scrobble-controls:pause", duration: "invalid" }, extensionSender), { ok: false, error: "invalidRequest" });
  await onMessage({ type: "scrobble-controls:pause", duration: "15m" }, extensionSender);
  time = 900_999;
  await observe("First", 1);
  assert.equal(blocked.at(-1), "paused");
  time = 901_000;
  await onAlarm({ name: "mireki:scrobble-resume" });
  assert.equal(blocked.at(-1), null, "pause deadline resumes processing through a one-shot alarm");
  assert.equal((await onMessage({ type: "scrobble-controls:get" }, extensionSender)).controls.mode, "active");

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
