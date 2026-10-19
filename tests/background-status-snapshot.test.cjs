const assert = require("node:assert/strict");
const test = require("node:test");

const RAW_TITLE = "E173 - Le gardien noir";
const RAW_ARTIST = "Black Clover";
const RAW_PAGE_TITLE = "Black Clover Saison 2";
const MATCHED_EPISODE = 14546332;

// Real store, controls, controller, parser, resolver and Trakt client. Only the
// Trakt API responses below are fixtures, and the first search is deferred.
const localValues = {};
const sessionValues = {};
function storageArea(values) {
  return {
    async get(key) {
      if (key == null) return { ...values };
      if (Array.isArray(key)) return Object.fromEntries(key.map((name) => [name, values[name]]));
      return { [key]: values[key] };
    },
    async set(update) { Object.assign(values, update); },
    async remove(key) {
      if (Array.isArray(key)) for (const name of key) delete values[name];
      else delete values[key];
    },
  };
}
let onStorageChanged;
let onMessage;
let onAlarm;
const scheduledAlarms = new Map();
const scrobbleRequests = [];

const auth = {
  accessToken() { return "fixture-token"; },
  async status() { return { connected: true }; },
  async disconnect() {},
};
global.MirekiAuthServices = { get() { return auth; } };
global.MirekiAuthConfig = { traktClientId: "fixture-client-id" };
global.MirekiSessions = require("../shared/session-store.js");
global.MirekiScrobbleControls = require("../playback/scrobble-controls.js");
global.MirekiCompletionThreshold = require("../shared/completion-threshold.js");
global.MirekiManualMatchStore = require("../playback/manual-match-store.js");
global.MirekiManualMatchService = require("../trakt/manual-match-service.js");
global.MirekiScrobbleController = require("../playback/scrobble-controller.js");
global.MirekiMatchMetadata = require("../shared/match-metadata.js");
global.MirekiTraktMatcher = require("../trakt/trakt-matcher.js");
global.MirekiTraktClient = require("../trakt/trakt-client.js");

let signalSearchEntered;
const searchEntered = new Promise((resolve) => { signalSearchEntered = resolve; });
let releaseSearch;
const searchGate = new Promise((resolve) => { releaseSearch = resolve; });
let searchDeferred = false;

const episodeFixture = {
  season: 2,
  number: 3,
  number_abs: 173,
  title: "Black Guardian",
  ids: { trakt: MATCHED_EPISODE },
};
const response = (status, value) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get() { return null; } },
  async json() { return value; },
});

global.fetch = async (url, options = {}) => {
  const { pathname, searchParams } = new URL(url);
  if (pathname === "/search/show/exact") {
    if (!searchDeferred && searchParams.get("query") === RAW_ARTIST) {
      searchDeferred = true;
      signalSearchEntered();
      await searchGate;
      return response(200, [{ type: "show", show: { title: RAW_ARTIST, ids: { trakt: 121959 } } }]);
    }
    return response(200, []);
  }
  if (pathname === "/shows/121959/seasons/2/episodes/173") return response(404, null);
  if (pathname === "/shows/121959/seasons") {
    return response(200, [{ number: 2, episodes: [episodeFixture] }]);
  }
  if (pathname === "/shows/121959/seasons/2") {
    return response(200, [{ ...episodeFixture, translations: [] }]);
  }
  const scrobbleAction = pathname.match(/^\/scrobble\/(start|pause)$/)?.[1];
  if (scrobbleAction && options.method === "POST") {
    const body = JSON.parse(options.body);
    scrobbleRequests.push([scrobbleAction, body.episode.ids.trakt, body.progress]);
    return response(201, { action: scrobbleAction });
  }
  return response(404, null);
};

global.browser = {
  runtime: {
    id: "mireki@test",
    getURL: (path = "") => `moz-extension://mireki/${path}`,
    onMessage: { addListener(listener) { onMessage = listener; } },
  },
  tabs: {
    onRemoved: { addListener() {} },
    onUpdated: { addListener() {} },
  },
  alarms: {
    async create(name, { when }) { scheduledAlarms.set(name, when); },
    async clear(name) { return scheduledAlarms.delete(name); },
    onAlarm: { addListener(listener) { onAlarm = listener; } },
  },
  storage: {
    local: storageArea(localValues),
    session: storageArea(sessionValues),
    onChanged: { addListener(listener) { onStorageChanged = listener; } },
  },
};

require("../shared/webextension-api.js");

function withDeadline(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

test("status:get exposes pending matching without preventing stale playback expiry", async (t) => {
  let time = 1_000;
  const realDateNow = Date.now;
  Date.now = () => time;
  t.after(() => { Date.now = realDateNow; });
  require("../background/scrobble-background.js");
  require("../background/background.js");
  assert.equal(typeof onStorageChanged, "function");
  assert.equal(typeof onAlarm, "function");
  const source = {
    id: browser.runtime.id,
    frameId: 0,
    url: "https://www.crunchyroll.com/watch/fixture",
    tab: { id: 1, url: "https://www.crunchyroll.com/watch/fixture" },
  };
  const media = {
    kind: "video",
    title: RAW_TITLE,
    artist: RAW_ARTIST,
    album: null,
    language: "fr",
    episodeNumber: null,
    duration: 1440,
    currentTime: 288,
    progress: 20,
    state: "playing",
    artwork: null,
  };
  const rawMedia = structuredClone(media);
  let status;
  let heartbeat;
  let heartbeatSettled = false;
  let expiry;
  let expirySettled = false;
  let observationSettled = false;
  const observation = onMessage({ type: "media:observation", media, pageTitle: RAW_PAGE_TITLE }, source);
  assert.equal(typeof observation.then, "function");
  observation.then(() => { observationSettled = true; }, () => { observationSettled = true; });
  try {
    await withDeadline(searchEntered, 2_000, "fixture Trakt search was never entered");
    assert.equal(searchDeferred, true);
    assert.equal(observationSettled, false, "observation acknowledgement waits for resolution");

    status = await withDeadline(
      onMessage({ type: "status:get" }, { id: browser.runtime.id }),
      500,
      "status:get waited for the in-flight matching request",
    );
    assert.equal(status.kind, "media");
    assert.equal(status.sync.state, "matching", "popup sees the intermediate matching state");
    assert.equal(status.media.title, RAW_TITLE);
    assert.equal(status.media.artist, RAW_ARTIST);
    assert.equal(status.source.pageTitle, RAW_PAGE_TITLE);
    assert.deepEqual(status.media, rawMedia, "raw observation values are not rewritten");

    const pendingTurn = await Promise.race([
      observation.then(() => "settled"),
      new Promise((resolve) => setImmediate(() => resolve("pending"))),
    ]);
    assert.equal(pendingTurn, "pending", "status:get must not release the observation acknowledgement");
    assert.equal(scheduledAlarms.get("mireki:session-expiry"), 31_000,
      "expiry is armed before the deferred Trakt search resolves");

    time = 11_000;
    heartbeat = onMessage({ type: "media:observation", media, pageTitle: RAW_PAGE_TITLE }, source);
    heartbeat.then(() => { heartbeatSettled = true; }, () => { heartbeatSettled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(scheduledAlarms.get("mireki:session-expiry"), 41_000,
      "a concurrent heartbeat refreshes expiry without waiting for matching");
    assert.equal(observationSettled, false);
    assert.equal(heartbeatSettled, false, "heartbeat acknowledgement also awaits queued controller work");

    time = 41_000;
    const expiredStatus = await withDeadline(
      onMessage({ type: "status:get" }, { id: browser.runtime.id }),
      500,
      "expired status:get waited for the in-flight matching request",
    );
    assert.equal(expiredStatus.kind, "empty", "the status poll purges the expired frame");
    assert.equal(MirekiScrobble.statusFor(status.source).state, "matching");
    assert.equal(scheduledAlarms.get("mireki:session-expiry"), time,
      "a status poll leaves the already-armed alarm available to clear controller state");

    scheduledAlarms.delete("mireki:session-expiry");
    expiry = onAlarm({ name: "mireki:session-expiry" });
    expiry.then(() => { expirySettled = true; }, () => { expirySettled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(observationSettled, false, "expiry does not detach the pending observation");
    assert.equal(heartbeatSettled, false);
    assert.equal(expirySettled, false, "expiry awaits the empty selection behind pending matching");
    assert.deepEqual(scrobbleRequests, [], "no scrobble is sent until the deferred search resolves");
  } finally {
    releaseSearch();
  }

  assert.deepEqual(
    await withDeadline(Promise.all([observation, heartbeat, expiry]), 2_000,
      "observation and expiry work did not settle after resolution"),
    [{ accepted: true }, { accepted: true }, { kind: "empty" }],
  );
  const finalStatus = await withDeadline(
    onMessage({ type: "status:get" }, { id: browser.runtime.id }),
    2_000,
    "final status:get did not settle",
  );
  assert.equal(finalStatus.kind, "empty");
  assert.equal(MirekiScrobble.statusFor(status.source).state, "idle",
    "the queued expiry clears the controller after resolution");
  assert.deepEqual(scrobbleRequests, [
    ["start", MATCHED_EPISODE, 20],
    ["pause", MATCHED_EPISODE, 20],
  ], "an expired match cannot leave a remote scrobble active");
  assert.equal(scheduledAlarms.has("mireki:session-expiry"), false);
  assert.equal(scheduledAlarms.has("mireki:scrobble-resume"), false);
  assert.deepEqual(media, rawMedia, "resolution did not mutate the raw observation");
});
