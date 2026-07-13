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
  const PROVIDER_HOSTS = Object.freeze([
    "animationdigitalnetwork.com", "crunchyroll.com", "disneyplus.com", "hbomax.com", "hulu.com",
    "max.com", "netflix.com", "paramountplus.com", "peacocktv.com", "primevideo.com",
  ]);
  function providerUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && (url.hostname === "tv.apple.com"
        || PROVIDER_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)));
    } catch { return false; }
  }
  const boundedString = (value, max) => typeof value === "string" && value.length <= max;
  const finiteRange = (value, min, max = Infinity) => Number.isFinite(value) && value >= min && value <= max;
  const validArtwork = (value) => value == null || MirekiArtwork.isValidArtworkUrl(value);

  function validMedia(media) {
    return media && typeof media === "object"
      && KINDS.has(media.kind)
      && (media.title === null || boundedString(media.title, 300))
      && (media.artist === null || boundedString(media.artist, 300))
      && (media.album === null || boundedString(media.album, 300))
      && (media.language == null || typeof media.language === "string" && /^[a-z]{2}$/.test(media.language))
      && (media.episodeNumber == null || Number.isInteger(media.episodeNumber)
        && media.episodeNumber > 0 && media.episodeNumber <= 9999)
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

  function validObservationSender(sender, extensionId) {
    return sender?.id === extensionId && Number.isInteger(sender?.tab?.id)
      && Number.isInteger(sender?.frameId) && sender.frameId >= 0
      && providerUrl(sender.url) && providerUrl(sender.tab.url);
  }

  class SessionStore {
    constructor({ extensionId, now = Date.now, staleMs = 30_000 }) {
      this.extensionId = extensionId;
      this.now = now;
      this.staleMs = staleMs;
      this.frames = new Map();
      this.selectedKey = null;
    }

    ingest(message, sender) {
      if (!validObservationSender(sender, this.extensionId) || !validObservation(message)) return false;
      const key = `${sender.tab.id}:${sender.frameId}`;
      if (message.media === null) {
        this.frames.delete(key);
        if (this.selectedKey === key) this.selectedKey = null;
      }
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
      for (const [key, entry] of this.frames) if (entry.source.tabId === tabId) {
        this.frames.delete(key);
        if (this.selectedKey === key) this.selectedKey = null;
      }
    }

    cleanup() {
      const cutoff = this.now() - this.staleMs;
      for (const [key, entry] of this.frames) if (entry.updatedAt <= cutoff) {
        this.frames.delete(key);
        if (this.selectedKey === key) this.selectedKey = null;
      }
    }

    nextExpiry() {
      if (!this.frames.size) return null;
      return Math.min(...[...this.frames.values()].map((entry) => entry.updatedAt + this.staleMs));
    }

    status() {
      this.cleanup();
      if (!this.frames.size) return { kind: "empty" };
      const current = this.frames.get(this.selectedKey);
      if (current?.media.state === "playing") return { kind: "media", media: current.media, source: current.source };
      const entries = [...this.frames.entries()];
      entries.sort(([, a], [, b]) => {
        const rank = (entry) => entry.media.state === "playing" ? 2 : entry.media.state === "paused" ? 1 : 0;
        return rank(b) - rank(a) || b.updatedAt - a.updatedAt
          || a.source.tabId - b.source.tabId || a.source.frameId - b.source.frameId;
      });
      const [key, entry] = entries[0];
      this.selectedKey = key;
      return { kind: "media", media: entry.media, source: entry.source };
    }
  }

  return { OBSERVATION, STATUS, PROVIDER_HOSTS, SessionStore, validMedia, validObservation, validObservationSender };
});
