(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiProviderAdapter = api;
})(globalThis, () => {
  const VIDEO_TITLE_UIA = /(^|-)video-title($|-)/i;
  const COORDINATES = /\bS\s*(\d{1,3})\s*[:.\-]?\s*E\s*(\d{1,4})\b/iu;
  const EPISODE_LABEL = /\bE\s*(\d{1,4})\b/iu;
  const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";
  const TEXT_SELECTOR = `${HEADING_SELECTOR}, span`;
  let cachedWatchId = null;
  let cachedMetadata = null;

  const text = (value) => typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/g, " ").slice(0, 300) : null;
  const unique = (values) => [...new Set(values.filter(Boolean))];

  function watchId(pageUrl) {
    try {
      const url = new URL(pageUrl);
      if (url.protocol !== "https:" || (url.hostname !== "netflix.com" && !url.hostname.endsWith(".netflix.com"))) return null;
      return url.pathname.match(/^\/watch\/(\d+)(?:\/|$)/)?.[1] || null;
    } catch {
      return null;
    }
  }

  const isTitleElement = (element) => VIDEO_TITLE_UIA.test(element?.getAttribute?.("data-uia") || "");

  function findTitleElement(document) {
    const exact = document.querySelector?.('[data-uia="video-title"]');
    if (exact) return exact;
    return Array.from(document.querySelectorAll?.("[data-uia]") || []).find(isTitleElement) || null;
  }

  function textParts(element) {
    const nodes = Array.from(element.querySelectorAll?.(TEXT_SELECTOR) || []).slice(0, 32);
    const leaves = nodes.filter((node) => !Array.from(node.children || []).some((child) => text(child.textContent)));
    return unique((leaves.length ? leaves : [element]).map((node) => text(node.textContent)))
      .filter((value) => value.toLocaleLowerCase() !== "netflix");
  }

  function parseTitleScope(element) {
    const parts = textParts(element);
    if (!parts.length) return null;
    const heading = text(element.querySelector?.(HEADING_SELECTOR)?.textContent);
    let coordinate;
    let coordinateIndex = -1;
    let consumed = 1;
    let prefix;
    let suffix;

    for (let index = 0; index < parts.length; index++) {
      let value = parts[index];
      let match = value.match(COORDINATES);
      if (!match && index + 1 < parts.length) {
        value = `${value} ${parts[index + 1]}`;
        match = value.match(COORDINATES);
        if (match) consumed = 2;
      }
      if (!match) continue;
      coordinate = `S${Number(match[1])}E${Number(match[2])}`;
      coordinateIndex = index;
      prefix = text(value.slice(0, match.index));
      suffix = text(value.slice(match.index + match[0].length));
      break;
    }

    if (!coordinate) {
      for (let index = 0; index < parts.length; index++) {
        let value = parts[index];
        let match = value.match(EPISODE_LABEL);
        let consumedParts = 1;
        if (!match && index + 1 < parts.length) {
          value = `${value} ${parts[index + 1]}`;
          match = value.match(EPISODE_LABEL);
          if (match) consumedParts = 2;
        }
        if (!match) continue;
        const show = text(value.slice(0, match.index)) || parts[index - 1] || null;
        const episodeTitle = text(value.slice(match.index + match[0].length))
          || parts[index + consumedParts] || null;
        const episodeNumber = Number(match[1]);
        if (show && episodeTitle && episodeNumber > 0) {
          return { title: episodeTitle, artist: show, episodeNumber, hasCoordinates: false, hasEpisodeLabel: true };
        }
      }
      return { title: parts.length === 1 ? parts[0] : heading || parts[0], hasCoordinates: false };
    }

    const before = parts.slice(0, coordinateIndex).find((value) => !COORDINATES.test(value));
    const after = parts.slice(coordinateIndex + consumed).find((value) => !COORDINATES.test(value));
    const artist = heading && !COORDINATES.test(heading) ? heading : prefix || before || null;
    const episodeTitle = suffix || after || null;
    return {
      title: text([coordinate, episodeTitle].filter(Boolean).join(" - ")),
      artist: artist === episodeTitle ? null : artist,
      hasCoordinates: true,
    };
  }

  function parseTitleElement(element) {
    let fallback = null;
    for (let scope = element, depth = 0; scope && depth < 3; scope = scope.parentElement, depth++) {
      const parsed = parseTitleScope(scope);
      fallback ||= parsed;
      if (parsed?.hasCoordinates || parsed?.hasEpisodeLabel) return parsed;
    }
    return fallback;
  }

  function extractMetadata({ document, metadata = {} }) {
    const id = watchId(document?.URL);
    if (!id) {
      cachedWatchId = null;
      cachedMetadata = null;
      return null;
    }
    if (id !== cachedWatchId) {
      cachedWatchId = id;
      cachedMetadata = null;
    }

    const parsed = parseTitleElement(findTitleElement(document));
    if (parsed?.title) cachedMetadata = parsed;
    const current = parsed?.title ? parsed : cachedMetadata;
    if (!current) return null;

    const result = {};
    const standardTitle = text(metadata.title);
    if (current.hasCoordinates || current.hasEpisodeLabel || !standardTitle || /^netflix$/iu.test(standardTitle)) result.title = current.title;
    const standardArtist = text(metadata.artist);
    if ((!standardArtist || /^netflix$/iu.test(standardArtist)) && current.artist) result.artist = current.artist;
    if (Number.isInteger(current.episodeNumber) && current.episodeNumber > 0) result.episodeNumber = current.episodeNumber;
    return Object.keys(result).length ? result : null;
  }

  function containsTitleElement(node) {
    const element = node?.nodeType === 3 ? node.parentElement : node;
    if (!element) return false;
    if (isTitleElement(element) || isTitleElement(element.closest?.("[data-uia]"))) return true;
    for (let scope = element, depth = 0; scope && depth < 3; scope = scope.parentElement, depth++) {
      if (Array.from(scope.querySelectorAll?.("[data-uia]") || []).some(isTitleElement)) return true;
    }
    return false;
  }

  function isMetadataMutation(record) {
    return [record?.target, ...Array.from(record?.addedNodes || []), ...Array.from(record?.removedNodes || [])]
      .some(containsTitleElement);
  }

  return { extractMetadata, isMetadataMutation };
});
