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
global.MirekiTraktClient = { createTraktClient() { return {}; } };
global.MirekiTraktMatcher = { createTraktMatcher() { return {}; } };
global.MirekiScrobbleController = {
  COMPLETED_KEY: "scrobble.completed.v1",
  createScrobbleController() {
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
console.log("scrobble background checks: OK");
