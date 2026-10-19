const assert = require("node:assert/strict");
const metadataApi = require("../shared/match-metadata.js");
const { parseMatchMetadata, normalizeTitle, languageCode } = metadataApi;

assert.deepEqual(Object.keys(metadataApi).sort(), [
  "languageCode", "normalizeTitle", "parseMatchMetadata",
]);

const media = (overrides = {}) => ({
  title: null,
  artist: null,
  album: null,
  language: null,
  episodeNumber: null,
  duration: null,
  ...overrides,
});

// Split-field coordinates and per-field completeness.
const splitSeason = parseMatchMetadata({
  media: media({
    title: "E3 - Paisible quotidien retrouvé",
    artist: "Mushoku Tensei",
    language: "fr",
    duration: 1440,
  }),
  pageTitle: "Saison 3 Paisible quotidien retrouvé - Regardez sur Crunchyroll",
});
assert.deepEqual(splitSeason.coordinates, { season: 3, episode: 3 });
assert.equal(splitSeason.absoluteEpisode, null, "season evidence blocks an absolute interpretation");
assert.equal(splitSeason.hasCompleteCoordinates, false,
  "coordinates assembled from separate fields are not complete in any one field");
assert.equal(splitSeason.episodeTitle, "Paisible quotidien retrouvé");
assert.equal(splitSeason.normalizedEpisodeTitle, "paisible quotidien retrouve");
assert.equal(splitSeason.episodeTitleQuery, "paisible quotidien retrouve");
assert.equal(splitSeason.sourceEpisodeNumber, 3);

const completeCoordinates = parseMatchMetadata({
  media: media({ title: "S3E3 - Paisible quotidien retrouvé", artist: "Mushoku Tensei" }),
});
assert.deepEqual(completeCoordinates.coordinates, { season: 3, episode: 3 });
assert.equal(completeCoordinates.hasCompleteCoordinates, true);
assert.equal(completeCoordinates.absoluteEpisode, null);
assert.equal(completeCoordinates.sourceEpisodeNumber, null,
  "a complete coordinate is not a source E-only label");

const conflictingCoordinates = parseMatchMetadata({
  media: media({ title: "S2E3 - Title", artist: "Show" }),
  pageTitle: "Saison 5",
});
assert.equal(conflictingCoordinates.coordinates, null, "conflicting seasons never combine");
assert.equal(conflictingCoordinates.hasCompleteCoordinates, true,
  "one coherent field still reports complete coordinates despite an aggregate conflict");

// Qualified season/part labels never supply an ordinary season.
const qualifiedSeason = parseMatchMetadata({
  media: media({ title: "E3 - Titre", artist: "Show" }),
  pageTitle: "Season 2: Part 2",
});
assert.equal(qualifiedSeason.coordinates, null, "a qualified season is not an ordinary season");
assert.equal(qualifiedSeason.absoluteEpisode, 3, "qualified season keeps the explicit E-only hint");
assert.equal(qualifiedSeason.hasCompleteCoordinates, false);

const contradictorySeasons = parseMatchMetadata({
  media: media({ title: "E3 - Titre", artist: "Show", album: "Season 3" }),
  pageTitle: "Saison 2",
});
assert.equal(contradictorySeasons.coordinates, null);
assert.equal(contradictorySeasons.absoluteEpisode, null,
  "ordinary season conflicts cannot degrade into an absolute hint");
assert.equal(contradictorySeasons.episodeTitle, "Titre");

// The two prefix-stripping passes stay distinct.
const doublePrefix = parseMatchMetadata({
  media: media({ title: "E3 - E3 - Name", artist: "Show" }),
});
assert.equal(doublePrefix.episodeTitle, "E3 - Name");
assert.equal(doublePrefix.normalizedEpisodeTitle, "e3 name");
assert.equal(doublePrefix.episodeTitleQuery, "name");

// Show queries: album before artist, exact deduplication, no whitespace collapsing.
const repeatedHints = parseMatchMetadata({
  media: media({ title: "E5 - Title", artist: "Other Show", album: "  Other  Show  " }),
});
assert.deepEqual(repeatedHints.showQueries, ["Other  Show", "Other Show"]);
assert.equal(repeatedHints.hasDistinctShowHints, true);

const sharedHint = parseMatchMetadata({
  media: media({ title: "Black Clover", artist: "Black Clover", album: "Black Clover" }),
});
assert.deepEqual(sharedHint.showQueries, ["Black Clover"]);
assert.equal(sharedHint.episodeTitle, null, "a title that only repeats a show query is not an episode title");
assert.equal(sharedHint.normalizedEpisodeTitle, "");
assert.equal(sharedHint.episodeTitleQuery, "");

assert.deepEqual(parseMatchMetadata({
  media: media({ title: "Title", artist: "Show", album: "   " }),
}).showQueries, ["Show"], "blank show hints are not queries");

// Show-title exclusion uses normalized titles; film classification compares lowercase only.
const punctuationHint = parseMatchMetadata({ media: media({ title: "Show!", artist: "Show" }) });
assert.equal(punctuationHint.episodeTitle, null, "normalized equality excludes the show title");
assert.equal(punctuationHint.hasDistinctShowHints, true, "film classification compares lowercase text only");

const caseHint = parseMatchMetadata({ media: media({ title: "show!", artist: "SHOW!" }) });
assert.equal(caseHint.episodeTitle, null);
assert.equal(caseHint.hasDistinctShowHints, false, "case alone is not a distinct show hint");

// Source, page-title, and provider numbering stay distinct signals.
const sourceHint = parseMatchMetadata({
  media: media({ title: "E173 - Le gardien noir", artist: "Black Clover", language: "fr" }),
  pageTitle: "Black Clover Saison 2",
});
assert.equal(sourceHint.sourceEpisodeNumber, 173, "only the source title supplies the source E-only label");
assert.deepEqual(sourceHint.coordinates, { season: 2, episode: 173 });
assert.equal(sourceHint.absoluteEpisode, null);
assert.equal(sourceHint.hasCompleteCoordinates, false);
assert.equal(sourceHint.episodeTitle, "Le gardien noir");

const pageOnlyHint = parseMatchMetadata({
  media: media({ title: "Le gardien noir", artist: "Black Clover" }),
  pageTitle: "E173 - Le gardien noir",
});
assert.equal(pageOnlyHint.sourceEpisodeNumber, null, "an E-label in the page title is not a source label");
assert.equal(pageOnlyHint.absoluteEpisode, 173);
assert.equal(pageOnlyHint.coordinates, null);
assert.equal(pageOnlyHint.hasCompleteCoordinates, false);

const providerHint = parseMatchMetadata({
  media: media({ title: "Black Guardian", artist: "Black Clover", episodeNumber: 173 }),
});
assert.equal(providerHint.providerEpisodeNumber, 173);
assert.equal(providerHint.absoluteEpisode, null, "a provider hint is not an episode label");
assert.equal(providerHint.sourceEpisodeNumber, null);

const rawProviderHint = parseMatchMetadata({
  media: media({ title: "Black Guardian", artist: "Black Clover", episodeNumber: "173" }),
});
assert.equal(rawProviderHint.providerEpisodeNumber, "173", "provider hints are never coerced");
assert.equal(rawProviderHint.absoluteEpisode, null);

// Original text is preserved, including a punctuation-only title.
const accentedTitle = parseMatchMetadata({
  media: media({ title: "E3 - Café Société", artist: "Show" }),
});
assert.equal(accentedTitle.episodeTitle, "Café Société");

const punctuationTitle = parseMatchMetadata({
  media: media({ title: "E3 - !!!", artist: "Show" }),
});
assert.equal(punctuationTitle.episodeTitle, "!!!");
assert.equal(punctuationTitle.normalizedEpisodeTitle, "");
assert.equal(punctuationTitle.episodeTitleQuery, "");

// Coordinates may come from any original field; show queries remain bounded strings.
const albumCoordinates = parseMatchMetadata({
  media: media({ title: "Titre", artist: "Show", album: "Saison 3 Épisode 4" }),
});
assert.deepEqual(albumCoordinates.coordinates, { season: 3, episode: 4 });
assert.equal(albumCoordinates.sourceEpisodeNumber, null);
assert.equal(albumCoordinates.hasCompleteCoordinates, true);
assert.deepEqual(albumCoordinates.showQueries, ["Saison 3 Épisode 4", "Show"]);

// The raw title keeps internal spaces; the cleaned episode title goes through
// the shared prefix stripper, which condenses whitespace.
const spacing = parseMatchMetadata({
  media: media({ title: "  Alpha   Beta  ", artist: `  ${"B".repeat(400)}  ` }),
});
assert.equal(spacing.title, "Alpha   Beta",
  "raw bounded title keeps internal spaces");
assert.equal(spacing.episodeTitle, "Alpha Beta",
  "episode-label prefix stripping condenses internal spaces");
assert.equal(spacing.showQueries[0].length, 300);
assert.equal(parseMatchMetadata({
  media: media({ title: `  ${"A".repeat(400)}  ` }),
}).title.length, 300);

// Normalization and language codes preserve the existing rules.
assert.equal(normalizeTitle("  Cafe\u0301   Crème! "), "cafe creme");
assert.equal(normalizeTitle("E3 - Name"), "e3 name");
assert.equal(normalizeTitle("!!!"), "");
assert.equal(normalizeTitle(null), "");
assert.equal(languageCode("FR"), "fr");
assert.equal(languageCode("de"), "de");
assert.equal(languageCode("fr-FR"), null);
assert.equal(languageCode(" all "), null);
assert.equal(languageCode(" fr "), null);
assert.equal(languageCode(42), null);
assert.equal(parseMatchMetadata({ media: media({ title: "Title", language: "DE" }) }).language, "de");
assert.equal(parseMatchMetadata({ media: media({ title: "Title", language: " all " }) }).language, null);

// Missing inputs keep the previous failure and tolerance rules.
assert.throws(() => parseMatchMetadata(), TypeError);
assert.throws(() => parseMatchMetadata(null), TypeError);
assert.throws(() => parseMatchMetadata({ pageTitle: "Saison 3" }), TypeError);
assert.throws(() => parseMatchMetadata({ media: null, pageTitle: "Saison 3" }), TypeError);

const nonTextualTitle = parseMatchMetadata({
  media: media({ title: 42, artist: "Show" }),
});
assert.equal(nonTextualTitle.title, null);
assert.equal(nonTextualTitle.coordinates, null);
assert.equal(nonTextualTitle.sourceEpisodeNumber, null);

const noPageTitle = parseMatchMetadata({
  media: media({ title: "E7 - Title", artist: "Show" }),
});
assert.equal(noPageTitle.coordinates, null);
assert.equal(noPageTitle.absoluteEpisode, 7);
assert.equal(noPageTitle.sourceEpisodeNumber, 7);
assert.equal(noPageTitle.hasCompleteCoordinates, false);

console.log("Match metadata checks: OK");
