(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiCompletionThreshold = api;
})(globalThis, () => {
  const COMPLETION_THRESHOLD_KEY = "scrobble.threshold.v1";
  const DEFAULT_COMPLETION_THRESHOLD = 90;
  const MIN_COMPLETION_THRESHOLD = 80;
  const MAX_COMPLETION_THRESHOLD = 100;

  function normalizeCompletionThreshold(value) {
    return Number.isInteger(value) && value >= MIN_COMPLETION_THRESHOLD && value <= MAX_COMPLETION_THRESHOLD
      ? value : DEFAULT_COMPLETION_THRESHOLD;
  }

  return {
    COMPLETION_THRESHOLD_KEY,
    DEFAULT_COMPLETION_THRESHOLD,
    MIN_COMPLETION_THRESHOLD,
    MAX_COMPLETION_THRESHOLD,
    normalizeCompletionThreshold,
  };
});
