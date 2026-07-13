(function (root, factory) {
  const episodeApi = root.MirekiEpisodeLabel
    || (typeof require === "function" ? require("../shared/episode-label.js") : null);
  const api = factory(episodeApi);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiProviderAdapter = api;
})(globalThis, (MirekiEpisodeLabel) => {
  const PLAYER_SELECTOR = '[id^="dv-web-player"]';
  const TITLE_SELECTOR = ".atvwebplayersdk-title-text";
  const EPISODE_SELECTOR = ".atvwebplayersdk-subtitle-text, .atvwebplayersdk-episode-info";
  const ARTWORK_SELECTOR = 'main [data-automation-id="hero-background"] img';
  const METADATA_SELECTOR = `${TITLE_SELECTOR}, ${EPISODE_SELECTOR}, ${ARTWORK_SELECTOR}`;
  const text = (value) => typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/g, " ").slice(0, 300) : null;
  const comparableText = (value) => text(value)?.normalize("NFKC").toLocaleLowerCase() || null;
  const sameText = (left, right) => Boolean(comparableText(left)
    && comparableText(left) === comparableText(right));

  function isPrimeVideo(pageUrl) {
    try {
      const url = new URL(pageUrl);
      return url.protocol === "https:"
        && (url.hostname === "primevideo.com" || url.hostname.endsWith(".primevideo.com"));
    } catch {
      return false;
    }
  }

  function parseEpisode(value) {
    const subtitle = text(value);
    if (!subtitle) return null;
    const coordinates = MirekiEpisodeLabel.findCoordinates(subtitle);
    if (!coordinates || coordinates.index !== 0) return null;
    const title = MirekiEpisodeLabel.stripEpisodePrefix(subtitle);
    if (!title || title === subtitle) return null;
    return { title: text(`S${coordinates.season}E${coordinates.episode} - ${title}`) };
  }

  function heroArtwork(document, artist) {
    const images = Array.from(document?.querySelectorAll?.(ARTWORK_SELECTOR) || []).slice(0, 8);
    const image = images.find((item) => sameText(item?.getAttribute?.("alt"), artist));
    return image?.currentSrc || image?.getAttribute?.("src") || null;
  }

  function extractMetadata({ document, mediaElement, metadata = {} }) {
    if (!isPrimeVideo(document?.URL)) return null;
    const player = mediaElement?.closest?.(PLAYER_SELECTOR);
    if (!player) return null;
    const artist = text(player.querySelector?.(TITLE_SELECTOR)?.textContent);
    const episode = parseEpisode(player.querySelector?.(EPISODE_SELECTOR)?.textContent);
    if (!artist || !episode) return null;
    const result = { ...episode, artist };
    if (!metadata.artwork) {
      const artwork = heroArtwork(document, artist);
      if (artwork) result.artwork = artwork;
    }
    return result;
  }

  function touchesMetadata(node, includeDescendants = false) {
    const element = node?.nodeType === 3 ? node.parentElement : node;
    return Boolean(element && (element.matches?.(METADATA_SELECTOR)
      || element.closest?.(METADATA_SELECTOR)
      || (includeDescendants && element.querySelector?.(METADATA_SELECTOR))));
  }

  function isMetadataMutation(record) {
    if (touchesMetadata(record?.target)) return true;
    return [...Array.from(record?.addedNodes || []), ...Array.from(record?.removedNodes || [])]
      .some((node) => touchesMetadata(node, true));
  }

  return { extractMetadata, isMetadataMutation };
});
