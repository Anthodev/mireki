(function (root, factory) {
  const episodeApi = root.MirekiEpisodeLabel
    || (typeof require === "function" ? require("./episode-label.js") : null);
  const api = factory(episodeApi);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiMatchMetadata = api;
})(globalThis, (MirekiEpisodeLabel) => {
  const bounded = (value) => typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : null;
  const unique = (values) => [...new Set(values.filter(Boolean))];
  const languageCode = (value) => typeof value === "string" && /^[a-z]{2}$/i.test(value) ? value.toLocaleLowerCase() : null;
  const normalizeTitle = (value) => bounded(value)?.normalize("NFKD").replace(/\p{M}/gu, "")
    .toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() || "";

  /**
   * Interpret a validated playback observation as structured matching metadata.
   *
   * Pure and synchronous: no DOM, network, storage, cache, or provider knowledge.
   * Throws when the observation or its media object is absent, matching the
   * previous matcher contract; an absent pageTitle is tolerated.
   *
   * @param {{ media: object, pageTitle?: string }} observation Validated observation.
   * @param {object} observation.media Provider-neutral media snapshot.
   * @param {string|null|undefined} observation.media.title Raw media title.
   * @param {string|null|undefined} observation.media.artist Raw artist/show hint.
   * @param {string|null|undefined} observation.media.album Raw album/show hint.
   * @param {string|null|undefined} observation.media.language Content language.
   * @param {number|string|null|undefined} observation.media.episodeNumber Provider within-season hint, unchanged.
   * @param {number|null|undefined} observation.media.duration Media duration, unchanged.
   * @param {string|null|undefined} [observation.pageTitle] Page title, a matching input.
   * @returns {{
   *   title: string|null,
   *   showQueries: string[],
   *   coordinates: { season: number, episode: number }|null,
   *   absoluteEpisode: number|null,
   *   providerEpisodeNumber: number|string|null|undefined,
   *   episodeTitle: string|null,
   *   normalizedEpisodeTitle: string,
   *   episodeTitleQuery: string,
   *   sourceEpisodeNumber: number|null,
   *   hasCompleteCoordinates: boolean,
   *   language: string|null,
   *   duration: number|string|null|undefined,
   *   hasDistinctShowHints: boolean,
   * }} Structured metadata consumed by the shared Trakt matcher.
   * @property {string|null} title Bounded original title, used for movie search.
   * @property {string[]} showQueries Bounded album-then-artist queries, exact dedupe.
   * @property {{ season: number, episode: number }|null} coordinates Ordinary coordinates
   *   assembled from all four original fields.
   * @property {number|null} absoluteEpisode Aggregated E-only hint; not proof of Trakt
   *   absolute numbering.
   * @property {number|string|null|undefined} providerEpisodeNumber Provider within-season hint,
   *   passed through unchanged.
   * @property {string|null} episodeTitle Once prefix-stripped title unless it only repeats a
   *   show query.
   * @property {string} normalizedEpisodeTitle Normalized episode title for direct coordinate
   *   response comparison.
   * @property {string} episodeTitleQuery Twice-prefix-stripped normalized title for catalogue
   *   search.
   * @property {number|null} sourceEpisodeNumber E-only hint found in the source media title only.
   * @property {boolean} hasCompleteCoordinates Whether any single field holds coherent
   *   coordinates, even when aggregated coordinates conflict.
   * @property {string|null} language Two-letter content language code, or null when not exact.
   * @property {number|string|null|undefined} duration Media duration, passed through unchanged.
   * @property {boolean} hasDistinctShowHints Lowercase show-hint comparison used for film
   *   classification.
   */
  function parseMatchMetadata({ media, pageTitle }) {
    const metadata = [media.title, media.artist, media.album, pageTitle];
    const coordinates = MirekiEpisodeLabel.parseEpisode(metadata);
    const absoluteEpisode = MirekiEpisodeLabel.parseAbsoluteEpisode(metadata);
    const showQueries = unique([media.album, media.artist].map(bounded));
    const title = bounded(media.title);
    const cleanedTitle = MirekiEpisodeLabel.stripEpisodePrefix(title);
    const episodeTitle = cleanedTitle
      && !showQueries.some((query) => normalizeTitle(query) === normalizeTitle(cleanedTitle))
      ? cleanedTitle : null;
    const normalizedEpisodeTitle = normalizeTitle(episodeTitle);
    const strippedQuery = MirekiEpisodeLabel.stripEpisodePrefix(bounded(episodeTitle));
    const episodeTitleQuery = strippedQuery ? normalizeTitle(strippedQuery) : "";
    const sourceEpisodeNumber = MirekiEpisodeLabel.findEpisodeNumber(media.title)?.episode || null;
    const hasCompleteCoordinates = metadata.some((value) => MirekiEpisodeLabel.findCoordinates(value));
    const hasDistinctShowHints = showQueries.some((value) =>
      value.toLocaleLowerCase() !== title?.toLocaleLowerCase());

    return {
      title,
      showQueries,
      coordinates,
      absoluteEpisode,
      providerEpisodeNumber: media.episodeNumber,
      episodeTitle,
      normalizedEpisodeTitle,
      episodeTitleQuery,
      sourceEpisodeNumber,
      hasCompleteCoordinates,
      language: languageCode(media.language),
      duration: media.duration,
      hasDistinctShowHints,
    };
  }

  return { parseMatchMetadata, normalizeTitle, languageCode };
});
