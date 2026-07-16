const assert = require("node:assert/strict");
const threshold = require("../shared/completion-threshold.js");

assert.deepEqual(Object.keys(threshold).sort(), [
  "COMPLETION_THRESHOLD_KEY",
  "DEFAULT_COMPLETION_THRESHOLD",
  "MAX_COMPLETION_THRESHOLD",
  "MIN_COMPLETION_THRESHOLD",
  "normalizeCompletionThreshold",
].sort());
assert.equal(threshold.COMPLETION_THRESHOLD_KEY, "scrobble.threshold.v1");
assert.equal(threshold.DEFAULT_COMPLETION_THRESHOLD, 90);
assert.equal(threshold.MIN_COMPLETION_THRESHOLD, 80);
assert.equal(threshold.MAX_COMPLETION_THRESHOLD, 100);
for (const value of [80, 85, 100]) assert.equal(threshold.normalizeCompletionThreshold(value), value);
for (const value of [79, 101, 89.5, "90", NaN, Infinity, null, undefined]) {
  assert.equal(threshold.normalizeCompletionThreshold(value), 90);
}
console.log("completion threshold checks: OK");
