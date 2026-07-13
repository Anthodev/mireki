(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiEpisodeLabel = api;
})(globalThis, () => {
  const SEASON = "season|saison|staffel|temporada|stagione|seizoen|sezon";
  const EPISODE = "episode|épisode|episodio|episódio|folge|aflevering|odcinek|ep|ép";
  const BOUNDARY = "(^|[^\\p{L}\\p{M}\\p{N}])";
  const END = "(?![\\p{L}\\p{M}\\p{N}])";
  const GAP = "[^\\p{L}\\p{M}\\p{N}]{0,30}";
  const coordinatePatterns = [
    `${BOUNDARY}S\\s*(?<season>\\d{1,3})\\s*[,.;:–—-]?\\s*E\\s*(?<episode>\\d{1,4})${END}`,
    `${BOUNDARY}(?<season>\\d{1,3})\\s*x\\s*(?<episode>\\d{1,4})${END}`,
    `${BOUNDARY}(?:${SEASON})\\s*(?<season>\\d{1,3})${END}${GAP}(?:(?:${EPISODE})|E)\\.?\\s*(?<episode>\\d{1,4})${END}`,
    `${BOUNDARY}(?:(?:${EPISODE})|E)\\.?\\s*(?<episode>\\d{1,4})${END}${GAP}(?:${SEASON})\\s*(?<season>\\d{1,3})${END}`,
  ];
  const seasonPattern = `${BOUNDARY}(?:${SEASON})\\s*(?<season>\\d{1,3})${END}`;
  const episodePattern = `${BOUNDARY}(?:(?:${EPISODE})|E)\\.?\\s*(?<episode>\\d{1,4})${END}`;

  const bounded = (value) => typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/g, " ").slice(0, 300) : null;
  const validSeason = (value) => Number.isInteger(value) && value >= 0 && value <= 999;
  const validEpisode = (value) => Number.isInteger(value) && value > 0 && value <= 9999;

  function result(match) {
    const prefixLength = match[1]?.length || 0;
    const season = Number(match.groups?.season);
    const episode = Number(match.groups?.episode);
    if (!validSeason(season) || !validEpisode(episode)) return null;
    return {
      season,
      episode,
      index: match.index + prefixLength,
      length: match[0].length - prefixLength,
    };
  }

  function coordinateMatches(value) {
    const text = bounded(value);
    if (!text) return [];
    const matches = [];
    for (const source of coordinatePatterns) {
      for (const match of text.matchAll(new RegExp(source, "giu"))) {
        const parsed = result(match);
        if (parsed) matches.push(parsed);
      }
    }
    return matches.sort((left, right) => left.index - right.index || right.length - left.length);
  }

  function findCoordinates(value) {
    const matches = coordinateMatches(value);
    if (!matches.length) return null;
    const { seasons, episodes } = signals([value]);
    return seasons.size === 1 && episodes.size === 1 ? matches[0] : null;
  }

  function signalMatches(value, source, key) {
    const text = bounded(value);
    if (!text) return [];
    const values = [];
    for (const match of text.matchAll(new RegExp(source, "giu"))) {
      const number = Number(match.groups?.[key]);
      if ((key === "season" ? validSeason : validEpisode)(number)) values.push(number);
    }
    return values;
  }

  function findEpisodeNumber(value) {
    const text = bounded(value);
    if (!text) return null;
    const { seasons, episodes } = signals([text]);
    if (seasons.size || episodes.size !== 1) return null;
    const match = text.match(new RegExp(episodePattern, "iu"));
    if (!match) return null;
    const episode = episodes.values().next().value;
    const prefixLength = match[1]?.length || 0;
    return { episode, index: match.index + prefixLength, length: match[0].length - prefixLength };
  }

  function signals(values) {
    const seasons = new Set();
    const episodes = new Set();
    for (const value of Array.isArray(values) ? values.slice(0, 64) : []) {
      for (const match of coordinateMatches(value)) {
        seasons.add(match.season);
        episodes.add(match.episode);
      }
      for (const season of signalMatches(value, seasonPattern, "season")) seasons.add(season);
      for (const episode of signalMatches(value, episodePattern, "episode")) episodes.add(episode);
    }
    return { seasons, episodes };
  }

  function parseEpisode(values) {
    const { seasons, episodes } = signals(values);
    if (seasons.size !== 1 || episodes.size !== 1) return null;
    return { season: seasons.values().next().value, episode: episodes.values().next().value };
  }

  function parseAbsoluteEpisode(values) {
    const { seasons, episodes } = signals(values);
    if (seasons.size || episodes.size !== 1) return null;
    return episodes.values().next().value;
  }

  function stripEpisodePrefix(value) {
    const text = bounded(value);
    if (!text) return null;
    const match = findCoordinates(text) || findEpisodeNumber(text);
    if (!match || match.index !== 0) return text;
    return bounded(text.slice(match.length).replace(/^\s*[:;,.\-–—]+\s*/u, ""));
  }

  return { findCoordinates, findEpisodeNumber, parseEpisode, parseAbsoluteEpisode, stripEpisodePrefix };
});
