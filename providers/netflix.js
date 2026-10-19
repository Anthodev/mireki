(function (root, factory) {
  const episodeApi = root.MirekiEpisodeLabel
    || (typeof require === "function" ? require("../shared/episode-label.js") : null);
  const api = factory(episodeApi);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiProviderAdapter = api;
})(globalThis, (MirekiEpisodeLabel) => {
  const VIDEO_TITLE_UIA = /(^|-)video-title($|-)/i;
  const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";
  const TEXT_SELECTOR = `${HEADING_SELECTOR}, span`;
  let cachedWatchId = null;
  let cachedMetadata = null;

  const text = (value) => typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/g, " ").slice(0, 300) : null;
  const unique = (values) => [...new Set(values.filter(Boolean))];
  const contentText = (value) => {
    const candidate = text(value)?.replace(/^[\s:;,.\-–—|]+|[\s:;,.\-–—|]+$/gu, "");
    return candidate && !MirekiEpisodeLabel.isSeasonOrPartLabel(candidate)
      && MirekiEpisodeLabel.stripEpisodePrefix(candidate) !== null ? candidate : null;
  };

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
    const rawParts = textParts(element);
    const parts = [];
    for (let index = 0; index < rawParts.length; index++) {
      const value = rawParts[index];
      const next = rawParts[index + 1];
      if (MirekiEpisodeLabel.isSeasonOrPartLabel(value) && MirekiEpisodeLabel.isSeasonOrPartLabel(next)
        && MirekiEpisodeLabel.isSeasonOrPartLabel(`${value} ${next}`)) {
        parts.push(`${value} ${next}`);
        index++;
      } else parts.push(value);
    }
    if (!parts.length) return null;
    const heading = contentText(element.querySelector?.(HEADING_SELECTOR)?.textContent);
    const scopeValues = parts.flatMap((value, index) => index + 1 < parts.length
      ? [value, `${value} ${parts[index + 1]}`] : [value]);
    const scopeCoordinates = MirekiEpisodeLabel.parseEpisode(scopeValues);
    const scopeEpisodeNumber = MirekiEpisodeLabel.parseAbsoluteEpisode(scopeValues);
    if (!scopeCoordinates && !scopeEpisodeNumber) {
      // Seeding a missing episode resolves absent signals (with at most one
      // season), but cannot resolve contradictory season or episode signals.
      const seededValues = [...scopeValues, "E1"];
      if (!MirekiEpisodeLabel.parseEpisode(seededValues)
        && !MirekiEpisodeLabel.parseAbsoluteEpisode(seededValues)) return { conflict: true };
    }
    let coordinate;
    let coordinateIndex = -1;
    let consumed = 1;
    let prefix;
    let suffix;

    for (let index = 0; index < parts.length; index++) {
      let value = parts[index];
      let match = MirekiEpisodeLabel.findCoordinates(value);
      if (!match && index + 1 < parts.length) {
        value = `${value} ${parts[index + 1]}`;
        match = MirekiEpisodeLabel.findCoordinates(value);
        if (match) consumed = 2;
      }
      if (!match) continue;
      if (!scopeCoordinates || match.season !== scopeCoordinates.season
        || match.episode !== scopeCoordinates.episode) return { conflict: true };
      coordinate = `S${match.season}E${match.episode}`;
      coordinateIndex = index;
      prefix = contentText(value.slice(0, match.index));
      suffix = contentText(value.slice(match.index + match.length));
      break;
    }

    if (!coordinate) {
      let hasEpisodeLabel = false;
      for (let index = 0; index < parts.length; index++) {
        let value = parts[index];
        let match = MirekiEpisodeLabel.findEpisodeNumber(value);
        let consumedParts = 1;
        if (!match && index + 1 < parts.length) {
          value = `${value} ${parts[index + 1]}`;
          match = MirekiEpisodeLabel.findEpisodeNumber(value);
          if (match) consumedParts = 2;
        }
        if (!match) continue;
        hasEpisodeLabel = true;
        if (match.episode !== scopeEpisodeNumber) return { conflict: true };
        const show = heading || contentText(value.slice(0, match.index))
          || parts.slice(0, index).reverse().map(contentText).find(Boolean);
        const episodeTitle = contentText(value.slice(match.index + match.length))
          || parts.slice(index + consumedParts).map(contentText)
            .find((candidate) => candidate && candidate !== show && !MirekiEpisodeLabel.findCoordinates(candidate));
        const episodeNumber = match.episode;
        if (show && episodeTitle && episodeNumber > 0) {
          return { title: episodeTitle, artist: show, episodeNumber, hasCoordinates: false, hasEpisodeLabel: true };
        }
      }
      const episodeTitles = unique(parts.map(contentText).filter((value) => value && value !== heading));
      if (!hasEpisodeLabel && heading && episodeTitles.length === 1) {
        return { title: episodeTitles[0], artist: heading, hasCoordinates: false, hasEpisodeTitle: true };
      }
      return { title: parts.length === 1 ? parts[0] : heading || parts[0], hasCoordinates: false };
    }

    const before = parts.slice(0, coordinateIndex).map(contentText)
      .find((value) => value && !MirekiEpisodeLabel.findCoordinates(value));
    const after = parts.slice(coordinateIndex + consumed).map(contentText)
      .find((value) => value && !MirekiEpisodeLabel.findCoordinates(value));
    const artist = heading && !MirekiEpisodeLabel.findCoordinates(heading) ? heading : prefix || before || null;
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
      if (parsed?.conflict) return parsed;
      fallback ||= parsed;
      if (parsed?.hasCoordinates || parsed?.hasEpisodeLabel || parsed?.hasEpisodeTitle) return parsed;
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
    if (parsed?.conflict) {
      cachedMetadata = null;
      return null;
    }
    if (parsed?.title) cachedMetadata = parsed;
    const current = parsed?.title ? parsed : cachedMetadata;
    if (!current) return null;

    const result = {};
    const standardTitle = text(metadata.title);
    if (current.hasCoordinates || current.hasEpisodeLabel || current.hasEpisodeTitle
      || !standardTitle || /^netflix$/iu.test(standardTitle)) result.title = current.title;
    const standardArtist = text(metadata.artist);
    if (/^netflix$/iu.test(standardArtist)) result.artist = current.artist || null;
    else if (!standardArtist && current.artist) result.artist = current.artist;
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
