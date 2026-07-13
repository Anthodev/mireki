(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiTraktMatcher = api;
})(globalThis, () => {
  const bounded = (value) => typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : null;
  const unique = (values) => [...new Set(values.filter(Boolean))];
  const languageCode = (value) => typeof value === "string" && /^[a-z]{2}$/i.test(value) ? value.toLocaleLowerCase() : null;
  const SEASON = "season|saison|staffel|temporada|stagione|seizoen|sezon";
  const EPISODE = "episode|épisode|episodio|episódio|folge|aflevering|odcinek";
  function parseEpisode(values) {
    const text = values.filter((value) => typeof value === "string").join(" | ");
    const patterns = [
      /\bS\s*(\d{1,3})\s*E\s*(\d{1,4})\b/iu,
      /\b(\d{1,3})\s*x\s*(\d{1,4})\b/iu,
      new RegExp(`\\b(?:${SEASON})\\s*(\\d{1,3})[^\\d]{0,30}E\\s*(\\d{1,4})\\b`, "iu"),
      new RegExp(`\\b(?:${SEASON})\\s*(\\d{1,3})[^\\d]{0,30}(?:${EPISODE})\\s*(\\d{1,4})\\b`, "iu"),
      new RegExp(`\\b(?:${EPISODE})\\s*(\\d{1,4})[^\\d]{0,30}(?:${SEASON})\\s*(\\d{1,3})\\b`, "iu"),
    ];
    for (let index = 0; index < patterns.length; index++) {
      const match = text.match(patterns[index]);
      if (!match) continue;
      const reverse = index === 4;
      const season = Number(match[reverse ? 2 : 1]);
      const episode = Number(match[reverse ? 1 : 2]);
      if (season >= 0 && episode >= 0) return { season, episode };
    }

    const seasons = new Set();
    const episodes = new Set();
    const seasonPattern = new RegExp(`\\b(?:${SEASON})\\s*(\\d{1,3})\\b`, "giu");
    const episodePattern = new RegExp(`\\b(?:(?:${EPISODE})|E)\\s*(\\d{1,4})\\b`, "giu");
    for (const value of values.filter((item) => typeof item === "string")) {
      for (const match of value.matchAll(seasonPattern)) seasons.add(Number(match[1]));
      for (const match of value.matchAll(episodePattern)) episodes.add(Number(match[1]));
    }
    if (seasons.size === 1 && episodes.size === 1) {
      const season = seasons.values().next().value;
      const episode = episodes.values().next().value;
      if (season >= 0 && episode > 0) return { season, episode };
    }
    return null;
  }
  function parseAbsoluteEpisode(values) {
    if (parseEpisode(values)) return null;
    const text = values.filter((value) => typeof value === "string").join(" | ");
    const match = text.match(/\b(?:(?:episode|épisode|episodio|episódio|folge|aflevering|odcinek)\s*|E\s*)(\d{1,4})\b/iu);
    const number = match ? Number(match[1]) : 0;
    return Number.isInteger(number) && number > 0 ? number : null;
  }
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
      for (const season of Array.isArray(seasons) ? seasons : []) {
        for (const episode of Array.isArray(season?.episodes) ? season.episodes : []) {
          if (values.length >= 5000) return values;
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
      return values;
    }
    async function episodes(showId) {
      if (!episodeCache.has(showId)) {
        if (episodeCache.size >= 20) episodeCache.delete(episodeCache.keys().next().value);
        const pending = client.seasons(showId).then(episodeValues)
          .catch((error) => { episodeCache.delete(showId); throw error; });
        episodeCache.set(showId, pending);
      }
      return episodeCache.get(showId);
    }
    async function translatedEpisodes(showId, language) {
      const code = languageCode(language);
      if (!code || typeof client.seasonEpisodes !== "function") return [];
      const key = `${showId}:${code}`;
      if (!translatedEpisodeCache.has(key)) {
        if (translatedEpisodeCache.size >= 40) translatedEpisodeCache.delete(translatedEpisodeCache.keys().next().value);
        const pending = episodes(showId).then(async (canonical) => {
          const translatedSeasonNumbers = canonical.filter((episode) => episode.season !== null
            && episode.translationLanguages.includes(code)).map((episode) => episode.season);
          const seasonNumbers = [...new Set((translatedSeasonNumbers.length ? translatedSeasonNumbers
            : canonical.filter((episode) => episode.season !== null).map((episode) => episode.season)))].slice(0, 50);
          const values = [];
          for (const season of seasonNumbers) {
            let translated;
            try { translated = await client.seasonEpisodes(showId, season, code); } catch (error) {
              if (error?.status === 404) continue;
              throw error;
            }
            for (const episode of Array.isArray(translated) ? translated : []) {
              if (values.length >= 5000) return values;
              const traktId = episode?.ids?.trakt;
              if (!Number.isInteger(traktId) || traktId <= 0) continue;
              const translations = Array.isArray(episode.translations) ? episode.translations
                .filter((item) => languageCode(item?.language) === code) : [];
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
          return values;
        }).catch((error) => { translatedEpisodeCache.delete(key); throw error; });
        translatedEpisodeCache.set(key, pending);
      }
      return translatedEpisodeCache.get(key);
    }
    function episodeTitleQueries(title) {
      const value = bounded(title);
      if (!value) return [];
      const withoutNumber = value.replace(new RegExp(
        `^\\s*(?:(?:${EPISODE})|E)\\s*\\d{1,4}\\s*(?:[-:–—.]\\s*)?`, "iu",
      ), "");
      return unique([value, withoutNumber].map(normalizeTitle));
    }
    function episodeTitleIds(values, title, episodeNumber, includeAbsolute = false) {
      const titles = episodeTitleQueries(title);
      const number = Number.isInteger(episodeNumber) && episodeNumber > 0 ? episodeNumber : null;
      return titles.length ? unique(values.filter((episode) => titles.some((titleValue) => episode.titles.includes(titleValue))
        && (number === null || episode.number === number || includeAbsolute && episode.numberAbs === number))
        .map((episode) => episode.traktId)) : [];
    }
    const matchedEpisode = (traktId) => ({ status: "matched", key: `episode:${traktId}`, item: { type: "episode", traktId } });
    async function episodeTitleIdsForShow(showId, title, language, episodeNumber, includeAbsolute = false) {
      let traktIds = episodeTitleIds(await episodes(showId), title, episodeNumber, includeAbsolute);
      if (!traktIds.length && languageCode(language)) {
        traktIds = episodeTitleIds(
          await translatedEpisodes(showId, language), title, episodeNumber, includeAbsolute,
        );
      }
      return traktIds;
    }
    async function episodeTitleIdsForShows(showIds, title, language, episodeNumber, includeAbsolute = false) {
      const values = [];
      for (const showId of showIds) {
        try {
          values.push(...await episodeTitleIdsForShow(
            showId, title, language, episodeNumber, includeAbsolute,
          ));
        } catch (error) {
          if (error?.status !== 404) throw error;
        }
      }
      return unique(values);
    }
    async function exactIds(type, queries) {
      const ids = [];
      for (const query of unique(queries.map(bounded)).slice(0, 4)) ids.push(...resultIds(await client.searchExact(type, query), type));
      return unique(ids);
    }
    async function exactShowIds(queries) {
      const ids = [];
      for (const query of unique(queries.map(bounded)).slice(0, 4)) {
        const exactResults = await client.searchExact("show", query);
        const exact = resultIds(exactResults, "show");
        if (exact.length === 1) { ids.push(exact[0]); continue; }
        if (exact.length > 1) {
          ids.push(...exact);
          continue;
        }
        const nearby = [];
        for (const searchQuery of showSearchQueries(query)) {
          nearby.push(...resultItems(await client.searchShows(searchQuery), "show")
            .filter((item) => nearTitle(query, item)).map((item) => item.ids.trakt));
          if (nearby.length) break;
        }
        ids.push(...unique(nearby));
      }
      return unique(ids);
    }
    async function match({ media, pageTitle }) {
      const metadata = [media.title, media.artist, media.album, pageTitle];
      const coordinates = parseEpisode(metadata);
      const absoluteEpisode = parseAbsoluteEpisode(metadata);
      const showQueries = unique([media.album, media.artist].map(bounded));
      const showIds = showQueries.length ? await exactShowIds(showQueries) : [];
      if (coordinates) {
        if (!showIds.length) return { status: "unmatched" };
        if (showIds.length > 3) return { status: "ambiguous" };
        const coordinateMatches = [];
        for (const showId of showIds) {
          try {
            const value = await client.episode(showId, coordinates.season, coordinates.episode);
            const traktId = value?.ids?.trakt;
            if (Number.isInteger(traktId) && traktId > 0) coordinateMatches.push(traktId);
          } catch (error) {
            if (error?.status !== 404) throw error;
          }
        }
        const traktIds = unique(coordinateMatches);
        return traktIds.length === 1 ? matchedEpisode(traktIds[0])
          : { status: traktIds.length > 1 ? "ambiguous" : "unmatched" };
      }
      if (absoluteEpisode) {
        if (!showIds.length) return { status: "unmatched" };
        if (showIds.length > 3) return { status: "ambiguous" };
        let traktIds = await episodeTitleIdsForShows(
          showIds, media.title, media.language, absoluteEpisode, true,
        );
        if (!traktIds.length) {
          traktIds = await episodeTitleIdsForShows(showIds, media.title, media.language, null);
        }
        return traktIds.length === 1 ? matchedEpisode(traktIds[0])
          : { status: traktIds.length > 1 ? "ambiguous" : "unmatched" };
      }
      if (showIds.length) {
        if (showIds.length > 3) return { status: "ambiguous" };
        let traktIds = await episodeTitleIdsForShows(
          showIds, media.title, media.language, media.episodeNumber,
        );
        if (!traktIds.length && media.episodeNumber) {
          traktIds = await episodeTitleIdsForShows(showIds, media.title, media.language, null);
        }
        if (traktIds.length === 1) return matchedEpisode(traktIds[0]);
        if (traktIds.length > 1 || showIds.length > 1) return { status: "ambiguous" };
        return { status: "needsEpisode" };
      }
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
