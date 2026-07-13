(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiScrobbleController = api;
})(globalThis, () => {
  const COMPLETED_KEY = "scrobble.completed.v1";
  const THRESHOLD = 85;
  const NEGATIVE_TTL = 5 * 60_000;
  const validCompleted = (value) => value && typeof value === "object" && !Array.isArray(value);
  const sourceKey = (source) => `${source?.tabId}:${source?.frameId}`;
  const normalizedIdentity = (values) => values.map((value) => value?.normalize("NFKC").trim().toLocaleLowerCase() || "").join("\u0000");
  const mediaIdentity = (media) => normalizedIdentity([media?.title, media?.artist, media?.album]);
  const matchIdentity = (status) => normalizedIdentity([status.media?.title, status.media?.artist, status.media?.album, status.source?.pageTitle]);

  function createScrobbleController({ matcher, client, isConnected, storage, onUnauthorized = async () => {}, now = Date.now }) {
    const negative = new Map();
    let selected = null;
    let queue = Promise.resolve();
    let completionQueue = Promise.resolve();
    let completedPromise;
    let generation = 0;
    let suspended = false;

    async function completed() {
      if (!completedPromise) completedPromise = storage.get(COMPLETED_KEY).then((value) => validCompleted(value?.[COMPLETED_KEY]) ? value[COMPLETED_KEY] : {});
      return completedPromise;
    }
    function updateCompleted(update, taskGeneration = generation) {
      const task = completionQueue.then(async () => {
        if (taskGeneration !== generation) return;
        const value = { ...await completed() };
        update(value);
        if (taskGeneration !== generation) return;
        const bounded = Object.fromEntries(Object.entries(value)
          .filter(([key, timestamp]) => /^(movie|episode):\d+$/.test(key) && Number.isFinite(timestamp))
          .sort((left, right) => right[1] - left[1]).slice(0, 500));
        await storage.set({ [COMPLETED_KEY]: bounded });
        if (taskGeneration === generation) completedPromise = Promise.resolve(bounded);
      });
      completionQueue = task.catch(() => {});
      return task;
    }
    function cacheNegative(key, status) {
      negative.delete(key);
      negative.set(key, { status, until: now() + NEGATIVE_TTL });
      if (negative.size > 200) negative.delete(negative.keys().next().value);
    }
    async function unauthorized() {
      suspended = true;
      generation++;
      negative.clear();
      await completionQueue.catch(() => {});
      completedPromise = Promise.resolve({});
      await onUnauthorized().catch(() => {});
    }
    async function pausePrevious(nextKey) {
      if (!selected?.match || selected.key === nextKey || selected.lastPlayback !== "playing") return;
      try { await client.scrobble("pause", selected.match.item, selected.progress); } catch (error) {
        if (error?.status === 401) await unauthorized();
      }
      selected.lastPlayback = "paused";
    }
    async function process(status) {
      const nextKey = status.kind === "media" ? sourceKey(status.source) : null;
      await pausePrevious(nextKey);
      if (status.kind !== "media") { selected = null; return; }
      const media = status.media;
      const cooldownKey = mediaIdentity(media);
      const fingerprint = matchIdentity(status);
      if (!selected || selected.key !== nextKey || selected.identity !== fingerprint) {
        await pausePrevious(null);
        selected = { key: nextKey, identity: fingerprint, status: "matching", match: null, lastPlayback: null, progress: media.progress, retryAt: 0 };
      }
      const state = selected;
      state.progress = media.progress;
      if (media.duration === null || media.progress === null) { state.status = "unsupported"; return; }
      if (state.retryAt > now()) return;
      if (!await isConnected()) { state.status = "notConnected"; return; }
      try {
        if (!state.match) {
          const cached = negative.get(cooldownKey);
          if (cached?.until > now()) { state.status = cached.status; return; }
          if (cached) negative.delete(cooldownKey);
          state.status = "matching";
          const result = await matcher.match({ media, pageTitle: status.source.pageTitle });
          if (selected !== state) return;
          if (result.status !== "matched") { cacheNegative(cooldownKey, result.status); state.status = result.status; return; }
          state.match = result;
        }
        let done = await completed();
        if (selected !== state) return;
        if (done[state.match.key] && media.progress < 10) {
          await updateCompleted((value) => { delete value[state.match.key]; });
          state.lastPlayback = null;
          done = await completed();
        }
        if (done[state.match.key]) { state.status = "synced"; state.lastPlayback = "stopped"; return; }
        const action = media.progress >= THRESHOLD ? "stop"
          : media.state === "playing" && state.lastPlayback !== "playing" ? "start"
          : media.state !== "playing" && state.lastPlayback === "playing" ? "pause" : null;
        if (!action) { state.status = media.state === "playing" ? "scrobbling" : "paused"; state.lastPlayback = media.state; return; }
        state.status = "syncing";
        await client.scrobble(action, state.match.item, media.progress);
        if (selected !== state) return;
        state.lastPlayback = action === "stop" ? "stopped" : media.state;
        if (action === "stop") { await updateCompleted((value) => { value[state.match.key] = now(); }); state.status = "synced"; }
        else state.status = action === "pause" ? "paused" : "scrobbling";
      } catch (error) {
        const transient = !Number.isInteger(error?.status) || error.status === 429 || error.status >= 500;
        state.status = error?.status === 401 ? "notConnected" : "error";
        state.retryAt = error?.status === 401 ? 0 : transient ? error?.retryAfter || now() + 30_000 : Infinity;
        if (!transient && error?.status !== 401) cacheNegative(cooldownKey, state.status);
        if (error?.status === 401) await unauthorized();
      }
    }
    function handle(status) {
      if (suspended) return Promise.resolve();
      const task = queue.then(() => process(status));
      queue = task.catch(() => {});
      return task;
    }
    function statusFor(source) {
      return { state: selected?.key === sourceKey(source) ? selected.status : "idle" };
    }
    async function reset() {
      suspended = true;
      generation++;
      await queue.catch(() => {});
      await completionQueue.catch(() => {});
      selected = null;
      negative.clear();
      completedPromise = Promise.resolve({});
    }
    function resume() { suspended = false; }
    return { handle, statusFor, reset, resume };
  }
  return { COMPLETED_KEY, THRESHOLD, NEGATIVE_TTL, createScrobbleController };
});
