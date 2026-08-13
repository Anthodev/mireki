(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiManualMatchService = api;
})(globalThis, () => {
  const boundedText = (value) => typeof value === "string" && value.trim()
    ? value.trim().slice(0, 300)
    : null;
  const positiveInteger = (value) => Number.isInteger(value) && value > 0;
  const coordinate = (value) => Number.isInteger(value) && value >= 0;
  const yearValue = (value) => Number.isInteger(value) && value >= 1800 && value <= 3000 ? value : null;

  function searchResult(result, type) {
    const value = result?.type === type ? result[type] : null;
    const title = boundedText(value?.title);
    const traktId = value?.ids?.trakt;
    if (!title || !positiveInteger(traktId)) return null;
    return {
      score: Number.isFinite(result.score) ? result.score : 0,
      value: { type, traktId, title, year: yearValue(value.year) },
    };
  }

  function resolvedItem(type, value) {
    const title = boundedText(value?.title);
    const traktId = value?.ids?.trakt;
    if (!title || !positiveInteger(traktId)) throw new Error("Invalid Trakt media");
    return { title, traktId, year: yearValue(value.year) };
  }

  function createManualMatchService(client) {
    async function search(query) {
      const value = boundedText(query);
      if (!value || value.length < 2 || value.length > 100) throw new Error("Invalid search query");
      const [movies, shows] = await Promise.all([
        client.searchMovies(value),
        client.searchShows(value),
      ]);
      const candidates = [
        ...(Array.isArray(movies) ? movies.map((result) => searchResult(result, "movie")) : []),
        ...(Array.isArray(shows) ? shows.map((result) => searchResult(result, "show")) : []),
      ].filter(Boolean).sort((left, right) => right.score - left.score);
      const seen = new Set();
      return candidates.filter(({ value: candidate }) => {
        const key = `${candidate.type}:${candidate.traktId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 10).map(({ value: candidate }) => candidate);
    }

    async function resolve(selection) {
      if (selection?.type === "movie" && positiveInteger(selection.traktId)) {
        const movie = resolvedItem("movie", await client.movie(selection.traktId));
        if (movie.traktId !== selection.traktId) throw new Error("Invalid Trakt media");
        return {
          item: { type: "movie", traktId: movie.traktId },
          display: {
            type: "movie",
            title: movie.title,
            showTitle: null,
            year: movie.year,
            season: null,
            episode: null,
          },
        };
      }
      if (selection?.type === "episode" && positiveInteger(selection.showId)
        && coordinate(selection.season) && coordinate(selection.episode)) {
        const [showValue, episodeValue] = await Promise.all([
          client.show(selection.showId),
          client.episode(selection.showId, selection.season, selection.episode),
        ]);
        const show = resolvedItem("show", showValue);
        const episode = resolvedItem("episode", episodeValue);
        if (show.traktId !== selection.showId
          || episodeValue.season !== selection.season || episodeValue.number !== selection.episode) {
          throw new Error("Invalid Trakt media");
        }
        return {
          item: { type: "episode", traktId: episode.traktId },
          display: {
            type: "episode",
            title: episode.title,
            showTitle: show.title,
            year: show.year,
            season: selection.season,
            episode: selection.episode,
          },
        };
      }
      throw new Error("Invalid manual selection");
    }

    return { search, resolve };
  }

  return { createManualMatchService };
});
