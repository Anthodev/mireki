(function (root, factory) {
  const artworkApi = root.MirekiArtwork || (typeof require === "function" ? require("../shared/artwork-url.js") : null);
  const api = factory(artworkApi);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiMedia = api;
})(globalThis, (MirekiArtwork) => {
  const finiteNonNegative = (value) => Number.isFinite(value) && value >= 0;
  const validDuration = (value) => Number.isFinite(value) && value > 0;
  const boundedText = (value) => typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : null;
  const artworkArea = (sizes) => {
    const matches = typeof sizes === "string" ? [...sizes.matchAll(/(\d+)x(\d+)/g)] : [];
    return matches.reduce((largest, match) => Math.max(largest, Number(match[1]) * Number(match[2])), 0);
  };

  function extractMediaSessionMetadata(navigator, pageUrl) {
    try {
      const metadata = navigator?.mediaSession?.metadata;
      const artwork = Array.from(metadata?.artwork || []).slice(0, 32)
        .map((item, index) => ({ url: MirekiArtwork.normalizeArtworkUrl(item?.src, pageUrl), area: artworkArea(item?.sizes), index }))
        .filter((item) => item.url)
        .sort((left, right) => right.area - left.area || right.index - left.index)[0]?.url || null;
      return { title: boundedText(metadata?.title), artist: boundedText(metadata?.artist), album: boundedText(metadata?.album), artwork };
    } catch {
      return { title: null, artist: null, album: null, artwork: null };
    }
  }

  function score(media) {
    const playing = !media.paused && !media.ended;
    if (playing && media.tagName === "VIDEO" && media.visible) return 4;
    if (playing) return 3;
    if (media.paused && !media.ended && validDuration(media.duration)) return 2;
    if (media.ended && validDuration(media.duration)) return 1;
    return 0;
  }

  function selectMedia(candidates) {
    return candidates.filter((candidate) => (!candidate.paused && !candidate.ended) || validDuration(candidate.duration))
      .reduce((best, candidate) => (!best || score(candidate) > score(best) ? candidate : best), null);
  }

  function normalizeMedia(media, metadata = {}, pageUrl) {
    const duration = validDuration(media.duration) ? media.duration : null;
    const currentTime = finiteNonNegative(media.currentTime) ? media.currentTime : 0;
    const progress = duration === null ? null : Math.min(100, Math.max(0, currentTime / duration * 100));
    return {
      kind: media.tagName === "AUDIO" ? "audio" : "video",
      title: boundedText(metadata.title) || boundedText(media.title),
      artist: boundedText(metadata.artist),
      album: boundedText(metadata.album),
      artwork: MirekiArtwork.normalizeArtworkUrl(metadata.artwork, pageUrl) || MirekiArtwork.normalizeArtworkUrl(media.poster, pageUrl),
      currentTime,
      duration,
      state: media.ended ? "ended" : media.paused ? "paused" : "playing",
      progress,
    };
  }

  function toPopupState(media, error) {
    if (error) return { kind: "error" };
    return media ? { kind: "media", media } : { kind: "empty" };
  }

  return { extractMediaSessionMetadata, normalizeMedia, selectMedia, toPopupState };
});
