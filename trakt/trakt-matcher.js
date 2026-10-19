(function (root, factory) {
  const episodeApi = root.MirekiEpisodeLabel
    || (typeof require === "function" ? require("../shared/episode-label.js") : null);
  const api = factory(episodeApi);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiTraktMatcher = api;
})(globalThis, (MirekiEpisodeLabel) => {
  const bounded = (value) => typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : null;
  const unique = (values) => [...new Set(values.filter(Boolean))];
  const languageCode = (value) => typeof value === "string" && /^[a-z]{2}$/i.test(value) ? value.toLocaleLowerCase() : null;
  const { parseEpisode, parseAbsoluteEpisode } = MirekiEpisodeLabel;
  const resultItems = (results, type) => results.map((result) => result?.type === type ? result[type] : null)
    .filter((item) => Number.isInteger(item?.ids?.trakt) && item.ids.trakt > 0);
  const resultIds = (results, type) => unique(resultItems(results, type).map((item) => item.ids.trakt));
  const normalizeTitle = (value) => bounded(value)?.normalize("NFKD").replace(/\p{M}/gu, "")
    .toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() || "";
  function withinOneEdit(left, right) {
    if (left === right) return true;
    if (Math.abs(left.length - right.length) > 1 || Math.min(left.length, right.length) < 5) return false;
    let leftIndex = 0;
    let rightIndex = 0;
    let edits = 0;
    while (leftIndex < left.length && rightIndex < right.length) {
      if (left[leftIndex] === right[rightIndex]) { leftIndex++; rightIndex++; continue; }
      if (++edits > 1) return false;
      if (left.length > right.length) leftIndex++;
      else if (right.length > left.length) rightIndex++;
      else { leftIndex++; rightIndex++; }
    }
    return edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
  }
  const nearTitle = (query, item) => withinOneEdit(normalizeTitle(query), normalizeTitle(item?.title));
  function showSearchQueries(query) {
    const value = bounded(query);
    if (!value) return [];
    const prefix = value.match(/^(.+?)(?::\s*|\s+[-–—]\s*)\S/u)?.[1]?.trim();
    return unique([value, prefix && normalizeTitle(prefix).length >= 3 ? prefix : null]);
  }
  function runtimeMatches(duration, runtime) {
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(runtime) || runtime <= 0) return false;
    const minutes = duration / 60;
    return Math.abs(minutes - runtime) <= Math.max(10, runtime * 0.2);
  }
  function createTraktMatcher(client) {
    const episodeCache = new Map();
    const translatedEpisodeCache = new Map();
    function episodeValues(seasons) {
      const values = [];
      const seasonNumbers = [...new Set((Array.isArray(seasons) ? seasons : [])
        .map((season) => season?.number).filter((number) => Number.isInteger(number) && number >= 0))];
      let complete = Array.isArray(seasons) && seasons.length < 200;
      for (const season of Array.isArray(seasons) ? seasons : []) {
        const entries = Array.isArray(season?.episodes) ? season.episodes : [];
        if (entries.length >= 500) complete = false;
        for (const episode of entries) {
          if (values.length >= 5000) return { values, seasonNumbers, complete: false };
          const traktId = episode?.ids?.trakt;
          if (!Number.isInteger(traktId) || traktId <= 0) continue;
          values.push({
            numberAbs: Number.isInteger(episode.number_abs) && episode.number_abs > 0 ? episode.number_abs : null,
            season: Number.isInteger(episode.season) && episode.season >= 0 ? episode.season
              : Number.isInteger(season?.number) && season.number >= 0 ? season.number : null,
            number: Number.isInteger(episode.number) && episode.number > 0 ? episode.number : null,
            traktId,
            titles: unique([episode.title, episode.original_title].map(normalizeTitle)),
            translationLanguages: unique((Array.isArray(episode.available_translations)
              ? episode.available_translations : []).map(languageCode)),
          });
        }
      }
      return { values, seasonNumbers, complete: complete && values.length < 5000 };
    }
    async function episodes(showId) {
      if (!episodeCache.has(showId)) {
        if (episodeCache.size >= 20) episodeCache.delete(episodeCache.keys().next().value);
        const pending = client.seasons(showId).then(episodeValues)
          .catch((error) => {
            episodeCache.delete(showId);
            if (error?.status === 404) return { values: [], seasonNumbers: [], complete: false };
            throw error;
          });
        episodeCache.set(showId, pending);
      }
      return episodeCache.get(showId);
    }
    async function translatedEpisodes(showId, language) {
      const code = language === "all" ? "all" : languageCode(language);
      if (!code || typeof client.seasonEpisodes !== "function") return { values: [], complete: true };
      const key = `${showId}:${code}`;
      if (!translatedEpisodeCache.has(key)) {
        if (translatedEpisodeCache.size >= 40) translatedEpisodeCache.delete(translatedEpisodeCache.keys().next().value);
        const pending = episodes(showId).then(async (canonical) => {
          const translatedSeasonNumbers = canonical.values.filter((episode) => episode.season !== null
            && episode.translationLanguages.includes(code)).map((episode) => episode.season);
          const knownSeasons = [...new Set([
            ...translatedSeasonNumbers,
            ...canonical.seasonNumbers,
            ...canonical.values.filter((episode) => episode.season !== null).map((episode) => episode.season),
          ])];
          const seasonNumbers = knownSeasons.slice(0, 50);
          const values = [];
          let complete = canonical.complete && knownSeasons.length <= 50;
          for (const season of seasonNumbers) {
            let translated;
            try { translated = await client.seasonEpisodes(showId, season, code); } catch (error) {
              if (error?.status === 404) { complete = false; continue; }
              throw error;
            }
            if (Array.isArray(translated) && translated.length >= 500) complete = false;
            for (const episode of Array.isArray(translated) ? translated : []) {
              if (values.length >= 5000) return { values, complete: false };
              const traktId = episode?.ids?.trakt;
              if (!Number.isInteger(traktId) || traktId <= 0) continue;
              const translations = Array.isArray(episode.translations) ? episode.translations
                .filter((item) => code === "all" ? Boolean(languageCode(item?.language)) : languageCode(item?.language) === code) : [];
              values.push({
                traktId,
                number: Number.isInteger(episode.number) && episode.number > 0 ? episode.number : null,
                numberAbs: Number.isInteger(episode.number_abs) && episode.number_abs > 0
                  ? episode.number_abs : null,
                titles: unique([episode.title, episode.original_title,
                  ...translations.map((item) => item.title)].map(normalizeTitle)),
              });
            }
          }
          return { values, complete: complete && values.length < 5000 };
        }).catch((error) => { translatedEpisodeCache.delete(key); throw error; });
        translatedEpisodeCache.set(key, pending);
      }
      return translatedEpisodeCache.get(key);
    }
    function episodeTitleQueries(title) {
      const value = bounded(title);
      if (!value) return [];
      const stripped = MirekiEpisodeLabel.stripEpisodePrefix(value);
      return stripped ? unique([stripped].map(normalizeTitle)) : [];
    }
    function episodeTitleIds(values, title, episodeNumber, includeAbsolute = false) {
      const titles = episodeTitleQueries(title);
      const number = Number.isInteger(episodeNumber) && episodeNumber > 0 ? episodeNumber : null;
      return titles.length ? unique(values.filter((episode) => titles.some((titleValue) => episode.titles.includes(titleValue))
        && (number === null || episode.number === number || includeAbsolute && episode.numberAbs === number))
        .map((episode) => episode.traktId)) : [];
    }
    const matchedEpisode = (traktId) => ({ status: "matched", key: `episode:${traktId}`, item: { type: "episode", traktId } });
    async function episodeTitleIdsForShows(showIds, title, language, episodeNumber, includeAbsolute = false) {
      const titleIds = [];
      const numberedIds = [];
      const absoluteIds = [];
      const completeAbsoluteIds = [];
      let complete = true;
      for (const showId of showIds) {
        const canonical = await episodes(showId);
        const translated = await translatedEpisodes(showId, language);
        complete = complete && canonical.complete && translated.complete;
        for (const catalogue of [canonical, translated]) {
          titleIds.push(...episodeTitleIds(catalogue.values, title, null));
          numberedIds.push(...episodeTitleIds(catalogue.values, title, episodeNumber, includeAbsolute));
          const absolute = Number.isInteger(episodeNumber) && episodeNumber > 0
            ? catalogue.values.filter((episode) => episode.numberAbs === episodeNumber).map((episode) => episode.traktId) : [];
          absoluteIds.push(...absolute);
          // Missing optional number_abs in one catalogue cannot disprove another source's numeric evidence.
          if (canonical.complete && catalogue.complete) completeAbsoluteIds.push(...absolute);
        }
      }
      return {
        titleIds: unique(titleIds), numberedIds: unique(numberedIds), complete,
        absoluteIds: unique(absoluteIds), completeAbsoluteIds: unique(completeAbsoluteIds),
      };
    }
    async function exactIds(type, queries) {
      const ids = [];
      for (const query of unique(queries.map(bounded)).slice(0, 4)) ids.push(...resultIds(await client.searchExact(type, query), type));
      return unique(ids);
    }
    async function showCandidates(queries) {
      const strongIds = [];
      const weakIds = [];
      for (const query of unique(queries.map(bounded)).slice(0, 4)) {
        const exactResults = await client.searchExact("show", query);
        const exactItems = resultItems(exactResults, "show");
        const exact = unique(exactItems.map((item) => item.ids.trakt));
        if (exact.length && exactItems.some((item) => nearTitle(query, item))) {
          strongIds.push(...exact);
          continue;
        }
        const nearby = [];
        for (const searchQuery of showSearchQueries(query)) {
          const items = resultItems(await client.searchShows(searchQuery), "show");
          for (const item of items) {
            (nearTitle(query, item) ? nearby : weakIds).push(item.ids.trakt);
          }
          if (nearby.length) break;
        }
        strongIds.push(...(nearby.length ? unique(nearby) : exact));
      }
      const strong = unique(strongIds);
      return { strongIds: strong, weakIds: unique(weakIds).filter((id) => !strong.includes(id)) };
    }
    async function match({ media, pageTitle }) {
      const metadata = [media.title, media.artist, media.album, pageTitle];
      const coordinates = parseEpisode(metadata);
      const absoluteEpisode = parseAbsoluteEpisode(metadata);
      const showQueries = unique([media.album, media.artist].map(bounded));
      const candidates = showQueries.length ? await showCandidates(showQueries) : { strongIds: [], weakIds: [] };
      const weak = !candidates.strongIds.length;
      const showIds = weak ? candidates.weakIds : candidates.strongIds;
      if (showIds.length) {
        if (showIds.length > 3) return { status: "ambiguous" };
        const cleanedTitle = MirekiEpisodeLabel.stripEpisodePrefix(bounded(media.title));
        const title = cleanedTitle && !showQueries.some((query) => normalizeTitle(query) === normalizeTitle(cleanedTitle))
          ? cleanedTitle : null;
        const normalizedTitle = normalizeTitle(title);
        const directTitleMatches = [];
        const coordinateMatches = [];
        if (coordinates) {
          for (const showId of showIds) {
            try {
              const value = await client.episode(showId, coordinates.season, coordinates.episode);
              const traktId = value?.ids?.trakt;
              if (Number.isInteger(traktId) && traktId > 0) {
                coordinateMatches.push(traktId);
                if (normalizedTitle && [value.title, value.original_title].some((valueTitle) =>
                  normalizeTitle(valueTitle) === normalizedTitle)) directTitleMatches.push(traktId);
              }
            } catch (error) {
              if (error?.status !== 404) throw error;
            }
          }
        }
        const coordinateIds = unique(coordinateMatches);
        const number = coordinates?.episode || absoluteEpisode || media.episodeNumber;
        const evidence = title
          ? await episodeTitleIdsForShows(showIds, title, languageCode(media.language), number, Boolean(absoluteEpisode))
          : { titleIds: [], numberedIds: [], complete: true, absoluteIds: [], completeAbsoluteIds: [] };
        // Direct responses prove title + requested coordinates even when a catalogue is incomplete.
        evidence.titleIds = unique([...evidence.titleIds, ...directTitleMatches]);
        evidence.numberedIds = unique([...evidence.numberedIds, ...directTitleMatches]);
        // Retry other languages only when normal matching has neither an exact title
        // nor a resolved/ambiguous strong coordinate or show result.
        if (title && !evidence.titleIds.length
          && (weak || !coordinateIds.length && showIds.length === 1)) {
          const multilingual = await episodeTitleIdsForShows(showIds, title, "all", number, Boolean(absoluteEpisode));
          evidence.titleIds = multilingual.titleIds;
          evidence.numberedIds = multilingual.numberedIds;
          evidence.complete = multilingual.complete;
          evidence.absoluteIds = unique([...evidence.absoluteIds, ...multilingual.absoluteIds]);
          evidence.completeAbsoluteIds = unique([...evidence.completeAbsoluteIds, ...multilingual.completeAbsoluteIds]);
        }
        const intersection = coordinateIds.filter((id) => evidence.titleIds.includes(id));
        if (intersection.length === 1) return matchedEpisode(intersection[0]);
        if (intersection.length > 1) return { status: "ambiguous" };
        if (weak) {
          // Broad noncanonical shows need both exact title and a real numeric hint.
          // Without coordinates, a partial catalogue cannot prove a unique match.
          if (!Number.isInteger(number) || number <= 0 || !evidence.numberedIds.length) {
            return { status: "unmatched" };
          }
          if (!evidence.complete || evidence.numberedIds.length > 1) return { status: "ambiguous" };
          return matchedEpisode(evidence.numberedIds[0]);
        }
        if (evidence.titleIds.length) {
          // A partial catalogue proves presence, never global uniqueness.
          if (!evidence.complete) return { status: "ambiguous" };
          if (evidence.titleIds.length === 1) return matchedEpisode(evidence.titleIds[0]);
          if (evidence.numberedIds.length === 1) return matchedEpisode(evidence.numberedIds[0]);
          return { status: "ambiguous" };
        }
        if (coordinateIds.length === 1) return matchedEpisode(coordinateIds[0]);
        if (coordinateIds.length > 1 || showIds.length > 1) return { status: "ambiguous" };
        // Final fallback: normal title/coordinate resolution has left one strong show and no exact title evidence.
        // Only a source E-only label can supply absolute numbering. A separate season
        // hint is allowed, but complete coordinates and conflicting signals are not.
        const sourceEpisode = MirekiEpisodeLabel.findEpisodeNumber(media.title)?.episode;
        if (sourceEpisode && (coordinates?.episode === sourceEpisode || absoluteEpisode === sourceEpisode)
          && !metadata.some((value) => MirekiEpisodeLabel.findCoordinates(value))) {
          const canonical = await episodes(showIds[0]);
          const canonicalIds = canonical.values.filter((episode) => episode.numberAbs === sourceEpisode)
            .map((episode) => episode.traktId);
          const absoluteIds = unique([...canonicalIds, ...evidence.absoluteIds]);
          if (absoluteIds.length) {
            if (!canonical.complete || absoluteIds.length > 1
              || !canonicalIds.includes(absoluteIds[0]) && !evidence.completeAbsoluteIds.includes(absoluteIds[0])) {
              return { status: "ambiguous" };
            }
            return matchedEpisode(absoluteIds[0]);
          }
        }
        return { status: coordinates || absoluteEpisode || media.episodeNumber ? "unmatched" : "needsEpisode" };
      }
      if (coordinates || absoluteEpisode) return { status: "unmatched" };
      const title = bounded(media.title);
      const distinctShowHints = showQueries.filter((value) => value.toLocaleLowerCase() !== title?.toLocaleLowerCase());
      if (distinctShowHints.length || !Number.isFinite(media.duration) || media.duration < 60 * 60) return { status: "unmatched" };
      if (!title) return { status: "unmatched" };
      const movieResults = await client.searchExact("movie", title);
      const movieIds = resultIds(movieResults, "movie");
      if (movieIds.length !== 1) return { status: movieIds.length > 1 ? "ambiguous" : "unmatched" };
      const movie = resultItems(movieResults, "movie").find((item) => item.ids.trakt === movieIds[0]);
      if (!runtimeMatches(media.duration, movie?.runtime)) return { status: "unmatched" };
      return { status: "matched", key: `movie:${movieIds[0]}`, item: { type: "movie", traktId: movieIds[0] } };
    }
    return { match };
  }
  return { createTraktMatcher, parseEpisode, parseAbsoluteEpisode, resultIds, runtimeMatches, withinOneEdit };
});
