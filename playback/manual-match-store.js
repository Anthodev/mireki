(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiManualMatchStore = api;
})(globalThis, () => {
  const MANUAL_MATCHES_KEY = "scrobble.manualMatches.v1";
  const MAX_MATCHES = 250;
  const boundedText = (value) => typeof value === "string" && value.trim()
    ? value.normalize("NFKC").trim().slice(0, 300)
    : null;
  const normalizedText = (value) => boundedText(value)?.toLocaleLowerCase() || "";
  const positiveInteger = (value) => Number.isInteger(value) && value > 0;
  const coordinate = (value) => Number.isInteger(value) && value >= 0 ? value : null;
  const yearValue = (value) => Number.isInteger(value) && value >= 1800 && value <= 3000 ? value : null;

  function manualMatchIdentity(status) {
    if (status?.kind !== "media") return null;
    const hostname = normalizedText(status.source?.hostname);
    if (!hostname) return null;
    return JSON.stringify([
      hostname,
      normalizedText(status.media?.title),
      normalizedText(status.media?.artist),
      normalizedText(status.media?.album),
      normalizedText(status.media?.language),
      positiveInteger(status.media?.episodeNumber) ? status.media.episodeNumber : null,
      normalizedText(status.source?.pageTitle),
    ]);
  }

  function normalizeCorrection(value) {
    const type = value?.item?.type;
    const traktId = value?.item?.traktId;
    const title = boundedText(value?.display?.title);
    if (!new Set(["movie", "episode"]).has(type) || !positiveInteger(traktId)
      || value?.display?.type !== type || !title) return null;
    const episode = type === "episode" ? coordinate(value.display.episode) : null;
    const season = type === "episode" ? coordinate(value.display.season) : null;
    const showTitle = type === "episode" ? boundedText(value.display.showTitle) : null;
    if (type === "episode" && (!showTitle || season === null || episode === null)) return null;
    return {
      item: { type, traktId },
      display: {
        type,
        title,
        showTitle,
        year: yearValue(value.display.year),
        season,
        episode,
      },
    };
  }

  function createManualMatchStore({ storage, now = Date.now }) {
    let valuesPromise;
    let writeQueue = Promise.resolve();

    async function values() {
      if (!valuesPromise) valuesPromise = storage.get(MANUAL_MATCHES_KEY).then((stored) => {
        const raw = stored?.[MANUAL_MATCHES_KEY];
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
        const valid = {};
        for (const [key, entry] of Object.entries(raw)) {
          const correction = normalizeCorrection(entry);
          if (correction && Number.isFinite(entry.updatedAt)) valid[key] = { ...correction, updatedAt: entry.updatedAt };
        }
        return valid;
      }).catch(() => ({}));
      return valuesPromise;
    }

    async function get(status) {
      const identity = manualMatchIdentity(status);
      if (!identity) return null;
      const entry = (await values())[identity];
      if (!entry) return null;
      const { updatedAt: _updatedAt, ...correction } = entry;
      return correction;
    }

    function mutate(operation) {
      const task = writeQueue.then(async () => {
        const current = { ...await values() };
        const result = operation(current);
        const bounded = Object.fromEntries(Object.entries(current)
          .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
          .slice(0, MAX_MATCHES));
        await storage.set({ [MANUAL_MATCHES_KEY]: bounded });
        valuesPromise = Promise.resolve(bounded);
        return result;
      });
      writeQueue = task.catch(() => {});
      return task;
    }

    async function set(status, value) {
      const identity = manualMatchIdentity(status);
      const correction = normalizeCorrection(value);
      if (!identity || !correction) throw new Error("Invalid manual match");
      return mutate((current) => {
        current[identity] = { ...correction, updatedAt: now() };
        return correction;
      });
    }

    async function remove(status) {
      const identity = manualMatchIdentity(status);
      if (!identity) return false;
      return mutate((current) => {
        if (!current[identity]) return false;
        delete current[identity];
        return true;
      });
    }

    return { get, set, remove, identity: manualMatchIdentity };
  }

  return { MANUAL_MATCHES_KEY, MAX_MATCHES, createManualMatchStore, manualMatchIdentity };
});
