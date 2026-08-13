const assert = require("node:assert/strict");
const { COMPLETION_THRESHOLD_KEY, DEFAULT_COMPLETION_THRESHOLD } = require("../shared/completion-threshold.js");
const { createScrobbleController, COMPLETED_KEY, MIN_SCROBBLE_PROGRESS, NEGATIVE_TTL } = require("../playback/scrobble-controller.js");
let stored = {};
const storage = { async get(key) { return { [key]: stored[key] }; }, async set(value) { Object.assign(stored, value); } };
const calls = [];
const client = { async scrobble(action, item, progress) { calls.push({ action, id: item.traktId, progress }); return { action: action === "stop" ? "scrobble" : action }; } };
const matcher = { async match({ media }) { const id = media.title === "Two" ? 2 : 1; return { status: "matched", key: `movie:${id}`, item: { type: "movie", traktId: id } }; } };
const source = (tabId, frameId = 0) => ({ tabId, frameId, url: `https://site${tabId}.test/watch`, hostname: `site${tabId}.test`, pageTitle: "Page" });
const status = (title, progress, state, tabId = 1, frameId = 0, extra = {}) => ({ kind: "media", source: source(tabId, frameId), media: { title, artist: null, album: null, duration: 100, progress, state, ...extra } });

(async () => {
  assert.equal(DEFAULT_COMPLETION_THRESHOLD, 90);
  assert.equal(MIN_SCROBBLE_PROGRESS, 1);
  const earlyCalls = [];
  const early = createScrobbleController({ matcher, client: { async scrobble(action) { earlyCalls.push(action); return { action }; } }, isConnected: async () => true, storage: { async get(){return{};},async set(){} } });
  await early.handle(status("One", 0.5, "playing", 12));
  await early.handle(status("One", 0.5, "paused", 12));
  assert.deepEqual(earlyCalls, [], "play and pause below one percent stay local");
  assert.equal(early.statusFor(source(12)).state, "paused");
  await early.handle(status("One", 1, "playing", 12));
  await early.handle(status("One", 2, "paused", 12));
  assert.deepEqual(earlyCalls, ["start", "pause"], "Trakt lifecycle starts at one percent");
  await early.handle(status("One", 2, "playing", 12));
  await early.handle(status("One", 0.5, "playing", 12));
  await early.handle(status("One", 10, "playing", 13));
  assert.deepEqual(earlyCalls, ["start", "pause", "start", "start"], "winner replacement never pauses below one percent");

  const controller = createScrobbleController({ matcher, client, isConnected: async () => true, storage, now: () => 1234 });
  await controller.handle(status("One", 10, "playing"));
  await controller.handle(status("One", 20, "playing", 2));
  assert.deepEqual(calls.map(({ action, id }) => [action, id]), [["start", 1], ["pause", 1], ["start", 1]], "replacement pauses prior global winner before start");
  await controller.handle(status("Two", 30, "playing", 2));
  assert.deepEqual(calls.slice(-2).map(({ action, id }) => [action, id]), [["pause", 1], ["start", 2]], "SPA metadata invalidates old match");
  await controller.handle(status("Two", 89, "playing", 2));
  assert.equal(stored[COMPLETED_KEY]?.["movie:2"], undefined, "below 90 percent does not complete");
  await controller.handle(status("Two", 90, "playing", 2));
  assert.equal(stored[COMPLETED_KEY]["movie:2"], 1234, "exact 90 percent completes");
  assert.equal(controller.statusFor(source(2)).state, "synced");
  const afterStop = calls.length;
  await controller.handle(status("One", 90, "playing", 2));
  assert.deepEqual(calls.slice(afterStop).map(({ action, id }) => [action, id]), [["stop", 1]], "completed items are never paused during winner replacement");
  await controller.handle({ kind: "empty" });
  assert.equal(controller.statusFor(source(2)).state, "idle");

  const customStored = {};
  const customCalls = [];
  const custom = createScrobbleController({
    matcher,
    client: { async scrobble(action) { customCalls.push(action); } },
    isConnected: async () => true,
    storage: {
      async get(key) { return { [key]: key === COMPLETION_THRESHOLD_KEY ? 85 : customStored[key] }; },
      async set(value) { Object.assign(customStored, value); },
    },
    now: () => 5678,
  });
  await custom.handle(status("One", 84, "playing", 14));
  assert.deepEqual(customCalls, ["start"], "stored 85 percent threshold does not stop at 84");
  await custom.handle(status("One", 85, "playing", 14));
  assert.deepEqual(customCalls, ["start", "stop"], "stored 85 percent threshold stops at 85");
  assert.equal(customStored[COMPLETED_KEY]["movie:1"], 5678, "custom threshold persists completion");
  assert.equal(custom.statusFor(source(14)).state, "synced");

  const rejectedCalls = [];
  const rejected = createScrobbleController({
    matcher,
    client: { async scrobble(action) { rejectedCalls.push(action); } },
    isConnected: async () => true,
    storage: {
      async get(key) { if (key === COMPLETION_THRESHOLD_KEY) throw new Error("unavailable"); return {}; },
      async set() {},
    },
  });
  await rejected.handle(status("One", 89, "playing", 15));
  await rejected.handle(status("One", 90, "playing", 15));
  assert.deepEqual(rejectedCalls, ["start", "stop"], "threshold read failure falls back to 90");

  let releaseThreshold;
  const beforeCalls = [];
  const before = createScrobbleController({
    matcher,
    client: { async scrobble(action) { beforeCalls.push(action); } },
    isConnected: async () => true,
    storage: {
      get(key) {
        if (key === COMPLETION_THRESHOLD_KEY) return new Promise((resolve) => { releaseThreshold = resolve; });
        return Promise.resolve({});
      },
      async set() {},
    },
  });
  before.setCompletionThreshold(85);
  const beforeObservation = before.handle(status("One", 86, "playing", 16));
  releaseThreshold({ [COMPLETION_THRESHOLD_KEY]: 99 });
  await beforeObservation;
  assert.deepEqual(beforeCalls, ["stop"], "change before initial threshold read wins");

  const afterCalls = [];
  const after = createScrobbleController({
    matcher,
    client: { async scrobble(action) { afterCalls.push(action); } },
    isConnected: async () => true,
    storage: {
      async get(key) { return { [key]: key === COMPLETION_THRESHOLD_KEY ? 99 : undefined }; },
      async set() {},
    },
  });
  await after.handle(status("One", 84, "playing", 17));
  after.setCompletionThreshold(85);
  await after.handle(status("One", 85, "playing", 17));
  assert.deepEqual(afterCalls, ["start", "stop"], "change after initial threshold read applies to the next observation");

  let time = 1000;
  let attempts = 0;
  const negative = createScrobbleController({ matcher: { async match() { attempts++; return { status: "unmatched" }; } }, client, isConnected: async () => true, storage: { async get(){return{};},async set(){} }, now: () => time });
  await negative.handle(status("Missing", 10, "playing", 3, 0, { duration: 100 }));
  const cosmeticChange = status("Missing", 20, "playing", 4, 0, { duration: 200 });
  await negative.handle(cosmeticChange);
  assert.equal(attempts, 1, "source and duration changes cannot bypass negative cooldown");
  const seasonPage = status("Missing", 20, "playing", 4, 0, { duration: 200 });
  seasonPage.source.pageTitle = "Saison 3 | E3 - Episode title";
  await negative.handle(seasonPage);
  assert.equal(attempts, 2, "season-bearing page title retries immediately");
  await negative.handle(status("Changed", 20, "playing", 4));
  assert.equal(attempts, 3, "title change retries immediately");
  time += NEGATIVE_TTL + 1;
  await negative.handle(status("Missing", 30, "playing", 4));
  assert.equal(attempts, 4, "deterministic result retries after cooldown");

  let pageMatches = 0;
  const pageAware = createScrobbleController({ matcher: { async match({ pageTitle }) { pageMatches++; const id = pageTitle === "Episode 2" ? 2 : 1; return { status: "matched", key: `episode:${id}`, item: { type: "episode", traktId: id } }; } }, client, isConnected: async () => true, storage: { async get(){return{};},async set(){} } });
  const firstPage = status("Generic", 10, "playing", 9); firstPage.source.pageTitle = "Episode 1";
  const secondPage = status("Generic", 10, "playing", 9); secondPage.source.pageTitle = "Episode 2";
  await pageAware.handle(firstPage);
  await pageAware.handle(secondPage);
  assert.equal(pageMatches, 2, "page-title episode changes invalidate matched SPA media");

  let retryTime = 1000;
  let retryAttempts = 0;
  const retrying = createScrobbleController({ matcher: { async match() { retryAttempts++; throw { status: 429, retryAfter: 5000 }; } }, client, isConnected: async () => true, storage: { async get(){return{};},async set(){} }, now: () => retryTime });
  await retrying.handle(status("Limited", 10, "playing", 6));
  await retrying.handle(status("Limited", 20, "playing", 6));
  assert.equal(retryAttempts, 1, "429 retry-after suppresses early retry");
  retryTime = 5000;
  await retrying.handle(status("Limited", 30, "playing", 6));
  assert.equal(retryAttempts, 2, "429 retries at deadline");

  let terminalAttempts = 0;
  const terminal = createScrobbleController({ matcher: { async match() { terminalAttempts++; throw { status: 422 }; } }, client, isConnected: async () => true, storage: { async get(){return{};},async set(){} } });
  await terminal.handle(status("Invalid", 10, "playing", 7));
  await terminal.handle(status("Invalid", 20, "playing", 7));
  assert.equal(terminalAttempts, 1, "terminal API failure uses negative cooldown");

  let manualCorrection = { item: { type: "movie", traktId: 77 }, key: "movie:77" };
  let automaticMatches = 0;
  const manualCalls = [];
  const manualController = createScrobbleController({
    matcher: { async match() { automaticMatches++; return { status: "matched", key: "movie:1", item: { type: "movie", traktId: 1 } }; } },
    manualMatches: { async get() { return manualCorrection; } },
    client: { async scrobble(action, item) { manualCalls.push([action, item.traktId]); return { action: action === "stop" ? "scrobble" : action }; } },
    isConnected: async () => true,
    storage: { async get(){return{};},async set(){} },
  });
  const manuallyMatched = status("Wrong automatic title", 10, "playing", 10);
  await manualController.handle(manuallyMatched);
  assert.equal(automaticMatches, 0, "manual correction bypasses automatic matching");
  assert.deepEqual(manualCalls, [["start", 77]]);
  manualCorrection = null;
  manualController.invalidateMatch();
  await manualController.handle(manuallyMatched);
  assert.equal(automaticMatches, 1, "removing a correction restores automatic matching immediately");
  assert.deepEqual(manualCalls, [["start", 77], ["pause", 77], ["start", 1]]);

  let releaseUnauthorized;
  let unauthorizedFinished = false;
  let unauthorizedScrobbles = 0;
  const unauthorized = createScrobbleController({ matcher, client: { async scrobble() { if (++unauthorizedScrobbles === 1) throw { status: 401 }; return { action: "start" }; } }, isConnected: async () => true, storage: { async get(){return{};},async set(){} }, onUnauthorized: () => new Promise((resolve) => { releaseUnauthorized = () => { unauthorizedFinished = true; resolve(); }; }) });
  const unauthorizedTask = unauthorized.handle(status("One", 10, "playing", 8));
  while (!releaseUnauthorized) await Promise.resolve();
  let unauthorizedSettled = false;
  unauthorizedTask.then(() => { unauthorizedSettled = true; });
  await Promise.resolve();
  assert.equal(unauthorizedSettled, false, "event work awaits unauthorized cleanup");
  releaseUnauthorized();
  await unauthorizedTask;
  assert.equal(unauthorizedFinished, true);
  await unauthorized.handle(status("One", 20, "playing", 8));
  assert.equal(unauthorizedScrobbles, 1, "401 suspends processing until reconnect");
  unauthorized.resume();
  await unauthorized.handle(status("One", 20, "playing", 8));
  assert.equal(unauthorizedScrobbles, 2, "successful reconnect resumes same selection without five-minute lock");

  let releaseSet;
  let writes = 0;
  const slowStorage = { async get(){return{};}, set() { writes++; return new Promise((resolve) => { releaseSet = resolve; }); } };
  const slow = createScrobbleController({ matcher, client, isConnected: async () => true, storage: slowStorage });
  const completion = slow.handle(status("One", 90, "playing", 5));
  while (!releaseSet) await Promise.resolve();
  const reset = slow.reset();
  let resetDone = false;
  reset.then(() => { resetDone = true; });
  await Promise.resolve();
  assert.equal(resetDone, false, "reset awaits old completion write queue");
  releaseSet();
  await Promise.all([completion, reset]);
  assert.equal(writes, 1);
  const callsBeforeSuspended = calls.length;
  await slow.handle(status("Two", 10, "playing", 5));
  assert.equal(calls.length, callsBeforeSuspended, "reset suspends new observations during disconnect");
  console.log("scrobble controller checks: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
