(function (root, factory) {
  const artworkApi = root.MirekiArtwork || (typeof require === "function" ? require("./artwork-url.js") : null);
  const api = factory(artworkApi);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiSessions = api;
})(globalThis, (MirekiArtwork) => {
  const OBSERVATION = "media:observation";
  const STATUS = "status:get";
  const STATES = new Set(["playing", "paused", "ended"]);
  const KINDS = new Set(["video", "audio"]);
  const httpUrl = (value) => {
    try { return /^https?:$/.test(new URL(value).protocol); } catch { return false; }
  };
  const boundedString = (value, max) => typeof value === "string" && value.length <= max;
  const finiteRange = (value, min, max = Infinity) => Number.isFinite(value) && value >= min && value <= max;
  const validArtwork = (value) => value == null || MirekiArtwork.isValidArtworkUrl(value);

  function validMedia(media) {
    return media && typeof media === "object"
      && KINDS.has(media.kind)
      && (media.title === null || boundedString(media.title, 300))
      && (media.artist === null || boundedString(media.artist, 300))
      && (media.album === null || boundedString(media.album, 300))
      && validArtwork(media.artwork)
      && finiteRange(media.currentTime, 0)
      && (media.duration === null || finiteRange(media.duration, Number.MIN_VALUE))
      && STATES.has(media.state)
      && (media.progress === null || finiteRange(media.progress, 0, 100));
  }

  function validObservation(message) {
    return message && message.type === OBSERVATION
      && (message.media === null || validMedia(message.media))
      && boundedString(message.pageTitle, 300);
  }

  class SessionStore {
    constructor({ extensionId, now = Date.now, staleMs = 30_000 }) {
      this.extensionId = extensionId;
      this.now = now;
      this.staleMs = staleMs;
      this.frames = new Map();
    }

    ingest(message, sender) {
      if (sender?.id !== this.extensionId || !Number.isInteger(sender?.tab?.id)
        || !Number.isInteger(sender?.frameId) || sender.frameId < 0
        || !httpUrl(sender.url) || !httpUrl(sender.tab.url) || !validObservation(message)) return false;
      const key = `${sender.tab.id}:${sender.frameId}`;
      if (message.media === null) this.frames.delete(key);
      else {
        const url = sender.tab.url;
        this.frames.set(key, {
          media: message.media,
          updatedAt: this.now(),
          source: {
            tabId: sender.tab.id,
            frameId: sender.frameId,
            url,
            hostname: new URL(url).hostname,
            pageTitle: message.pageTitle,
          },
        });
      }
      return true;
    }

    removeTab(tabId) {
      for (const [key, entry] of this.frames) if (entry.source.tabId === tabId) this.frames.delete(key);
    }

    cleanup() {
      const cutoff = this.now() - this.staleMs;
      for (const [key, entry] of this.frames) if (entry.updatedAt < cutoff) this.frames.delete(key);
    }

    status() {
      this.cleanup();
      const entries = [...this.frames.values()];
      if (!entries.length) return { kind: "empty" };
      entries.sort((a, b) => {
        const rank = (entry) => entry.media.state === "playing" ? 2 : entry.media.state === "paused" ? 1 : 0;
        return rank(b) - rank(a) || b.updatedAt - a.updatedAt
          || a.source.tabId - b.source.tabId || a.source.frameId - b.source.frameId;
      });
      return { kind: "media", media: entries[0].media, source: entries[0].source };
    }
  }

  return { OBSERVATION, STATUS, SessionStore, validMedia, validObservation };
});
