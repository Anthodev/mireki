const assert = require("node:assert/strict");
const { COMPLETION_THRESHOLD_KEY } = require("../shared/completion-threshold.js");

let onStorageChanged;
const thresholdChanges = [];
global.MirekiAuthServices = {
  get() {
    return {
      accessToken() { return null; },
      async status() { return { connected: false }; },
      async disconnect() {},
    };
  },
};
global.MirekiAuthConfig = { traktClientId: "client-id" };
const fixtureClient = {
  async searchExact(type, query) {
    if (type !== "show") return [];
    if (query === "Series") return [{ type: "show", show: { title: "Series", ids: { trakt: 80 } } }];
    if (query === "Ashen Crown") return [{ type: "show", show: { title: "Ashen Crown", ids: { trakt: 121959 } } }];
    return [];
  },
  async searchShows() { return []; },
  async episode() { throw Object.assign(new Error("Not found"), { status: 404 }); },
  async seasons(showId) {
    return showId === 80
      ? [{ number: 4, episodes: [{ season: 4, number: 3, title: "Titre", ids: { trakt: 403 } }] }]
      : [{ number: 2, episodes: [{
        season: 2, number: 3, number_abs: 173, title: "Cinder Warden", ids: { trakt: 14546332 },
      }] }];
  },
  async seasonEpisodes() { return []; },
};
global.MirekiTraktClient = { createTraktClient() { return fixtureClient; } };
global.MirekiMatchMetadata = require("../shared/match-metadata.js");
global.MirekiTraktMatcher = require("../trakt/trakt-matcher.js");
const manualMatches = {
  identity() { return "identity"; },
  async get() { return null; },
  async set(_status, correction) { return correction; },
  async remove() { return true; },
};
global.MirekiManualMatchStore = { createManualMatchStore() { return manualMatches; } };
global.MirekiManualMatchService = {
  createManualMatchService() {
    return {
      async search() { return []; },
      async resolve() { return { item: { type: "movie", traktId: 1 }, display: { type: "movie", title: "Movie" } }; },
    };
  },
};
let capturedOptions;
global.MirekiScrobbleController = {
  COMPLETED_KEY: "scrobble.completed.v1",
  createScrobbleController(options) {
    capturedOptions = options;
    return { setCompletionThreshold(value) { thresholdChanges.push(value); } };
  },
};
global.MirekiCompletionThreshold = require("../shared/completion-threshold.js");
global.browser = {
  storage: {
    local: {
      async get() { return {}; },
      async set() {},
      async remove() {},
    },
    onChanged: { addListener(listener) { onStorageChanged = listener; } },
  },
};
global.fetch = async () => {};

require("../background/scrobble-background.js");
assert.equal(typeof onStorageChanged, "function");
onStorageChanged({ [COMPLETION_THRESHOLD_KEY]: { oldValue: 90, newValue: 85 } }, "local");
assert.deepEqual(thresholdChanges, [85], "threshold change refreshes the controller once");
onStorageChanged({ [COMPLETION_THRESHOLD_KEY]: { oldValue: 85 } }, "local");
assert.deepEqual(thresholdChanges, [85, undefined], "threshold removal restores the default");
onStorageChanged({ "unrelated.key": { newValue: true } }, "local");
assert.deepEqual(thresholdChanges, [85, undefined], "unrelated storage changes are ignored");
onStorageChanged({ [COMPLETION_THRESHOLD_KEY]: { newValue: 95 } }, "sync");
assert.deepEqual(thresholdChanges, [85, undefined], "non-local storage changes are ignored");
(async () => {
  assert.equal(typeof capturedOptions.matcher.match, "function");
  assert.equal((await capturedOptions.matcher.match({
    media: { title: "E3 - Titre", artist: "Series", album: "Season 2: Part 2" }, pageTitle: "",
  })).item.traktId, 403, "real composition resolves split-season metadata before resolution");
  assert.equal((await capturedOptions.matcher.match({
    media: { title: "E173 - Le veilleur de cendre", artist: "Ashen Crown", language: "fr" }, pageTitle: "",
  })).item.traktId, 14546332, "real composition resolves an E-only source label through strict absolute evidence");
  console.log("scrobble background checks: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
