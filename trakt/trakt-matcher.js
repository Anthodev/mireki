(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiTraktMatcher = api;
})(globalThis, () => {
  const bounded = (value) => typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : null;
  const unique = (values) => [...new Set(values.filter(Boolean))];
  const SEASON = "season|saison|staffel|temporada|stagione|seizoen|sezon";
  const EPISODE = "episode|épisode|episodio|episódio|folge|aflevering|odcinek";
  function parseEpisode(values) {
    const text = values.filter((value) => typeof value === "string").join(" | ");
    const patterns = [
      /\bS\s*(\d{1,3})\s*E\s*(\d{1,4})\b/iu,
      /\b(\d{1,3})\s*x\s*(\d{1,4})\b/iu,
      new RegExp(`\\b(?:${SEASON})\\s*(\\d{1,3})[^\\d]{0,30}(?:${EPISODE})\\s*(\\d{1,4})\\b`, "iu"),
      new RegExp(`\\b(?:${EPISODE})\\s*(\\d{1,4})[^\\d]{0,30}(?:${SEASON})\\s*(\\d{1,3})\\b`, "iu"),
    ];
    for (let index = 0; index < patterns.length; index++) {
      const match = text.match(patterns[index]);
      if (!match) continue;
      const reverse = index === 3;
      const season = Number(match[reverse ? 2 : 1]);
      const episode = Number(match[reverse ? 1 : 2]);
      if (season >= 0 && episode >= 0) return { season, episode };
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
  function runtimeMatches(duration, runtime) {
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(runtime) || runtime <= 0) return false;
    const minutes = duration / 60;
    return Math.abs(minutes - runtime) <= Math.max(10, runtime * 0.2);
  }
  function createTraktMatcher(client) {
    const episodeCache = new Map();
    async function episodes(showId) {
      if (!episodeCache.has(showId)) {
        if (episodeCache.size >= 20) episodeCache.delete(episodeCache.keys().next().value);
        const pending = client.seasons(showId).then((seasons) => {
          const values = [];
          for (const season of Array.isArray(seasons) ? seasons : []) {
            for (const episode of Array.isArray(season?.episodes) ? season.episodes : []) {
              if (values.length >= 5000) return values;
              if (Number.isInteger(episode?.number_abs) && episode.number_abs > 0
                && Number.isInteger(episode?.ids?.trakt) && episode.ids.trakt > 0) {
                values.push({ numberAbs: episode.number_abs, traktId: episode.ids.trakt });
              }
            }
          }
          return values;
        }).catch((error) => { episodeCache.delete(showId); throw error; });
        episodeCache.set(showId, pending);
      }
      return episodeCache.get(showId);
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
          const narrowed = unique(resultItems(exactResults, "show").filter((item) => nearTitle(query, item)).map((item) => item.ids.trakt));
          ids.push(...(narrowed.length === 1 ? narrowed : exact));
          continue;
        }
        const nearby = unique(resultItems(await client.searchShows(query), "show")
          .filter((item) => nearTitle(query, item)).map((item) => item.ids.trakt));
        ids.push(...nearby);
      }
      return unique(ids);
    }
    async function match({ media, pageTitle }) {
      const metadata = [media.title, media.artist, media.album, pageTitle];
      const coordinates = parseEpisode(metadata);
      const absoluteEpisode = parseAbsoluteEpisode(metadata);
      const showQueries = unique([media.album, media.artist].map(bounded));
      const showIds = showQueries.length ? await exactShowIds(showQueries) : [];
      if (showIds.length > 1) return { status: "ambiguous" };
      if (coordinates) {
        if (showIds.length !== 1) return { status: showIds.length ? "ambiguous" : "unmatched" };
        try {
          const value = await client.episode(showIds[0], coordinates.season, coordinates.episode);
          const traktId = value?.ids?.trakt;
          if (!Number.isInteger(traktId) || traktId <= 0) return { status: "unmatched" };
          return { status: "matched", key: `episode:${traktId}`, item: { type: "episode", traktId } };
        } catch (error) {
          if (error?.status === 404) return { status: "unmatched" };
          throw error;
        }
      }
      if (absoluteEpisode) {
        if (showIds.length !== 1) return { status: showIds.length ? "ambiguous" : "unmatched" };
        try {
          const matches = (await episodes(showIds[0])).filter((episode) => episode.numberAbs === absoluteEpisode);
          const traktIds = unique(matches.map((episode) => episode.traktId));
          if (traktIds.length !== 1) return { status: traktIds.length > 1 ? "ambiguous" : "unmatched" };
          return { status: "matched", key: `episode:${traktIds[0]}`, item: { type: "episode", traktId: traktIds[0] } };
        } catch (error) {
          if (error?.status === 404) return { status: "unmatched" };
          throw error;
        }
      }
      if (showIds.length === 1) return { status: "needsEpisode" };
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
