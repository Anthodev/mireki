const assert = require("node:assert/strict");
const { createTraktMatcher } = require("../trakt/trakt-matcher.js");
const { parseEpisode, parseAbsoluteEpisode } = require("../shared/episode-label.js");
const { parseMatchMetadata } = require("../shared/match-metadata.js");
assert.deepEqual(parseEpisode(["S02E07 — Title"]), { season: 2, episode: 7 });
assert.deepEqual(parseEpisode(["Saison 3 Épisode 4"]), { season: 3, episode: 4 });
assert.deepEqual(parseEpisode(["Saison 3 | E3 - Paisible quotidien retrouvé"]), { season: 3, episode: 3 });
assert.deepEqual(parseEpisode([
  "E3 - Paisible quotidien retrouvé",
  "Mushoku Tensei: Jobless Reincarnation",
  null,
  "Saison 3 Paisible quotidien retrouvé - Regardez sur Crunchyroll",
]), { season: 3, episode: 3 }, "season and episode coordinates may come from separate metadata fields");
assert.equal(parseEpisode(["E3 - Title", "Saison 2", "Season 3"]), null,
  "conflicting season signals are never combined");
assert.deepEqual(parseEpisode(["Folge 8 Staffel 2"]), { season: 2, episode: 8 });
assert.equal(parseEpisode(["Episode 7"]), null, "missing season is never guessed");
assert.equal(parseAbsoluteEpisode(["Episode 52"]), 52);
assert.equal(parseAbsoluteEpisode(["E52 - Le favori de Toskushiro"]), 52);
assert.equal(parseAbsoluteEpisode(["Saison 5 Épisode 3"]), null, "season coordinates take priority");
function client(searches, episode = { season: 1, number: 3, ids: { trakt: 99 } }, seasons = []) {
  return { async searchExact(type, query) { return searches[`${type}:${query}`] || []; }, async searchShows(query) { return searches[`show~${query}`] || []; }, async episode() { return episode; }, async seasons() { return seasons; } };
}
const result = (type, id, runtime = 100) => ({ type, [type]: { title: "Canonical title", runtime, ids: { trakt: id } } });
(async () => {
  const localized = createTraktMatcher(client({ "movie:Le Voyage": [result("movie", 10)] }));
  assert.deepEqual(await localized.match(parseMatchMetadata({ media: { title: "Le Voyage", artist: null, album: null, duration: 6000 }, pageTitle: "" })), { status: "matched", key: "movie:10", item: { type: "movie", traktId: 10 } });
  const episodeLike = createTraktMatcher(client({ "show:Unknown local show": [], "movie:Chapter": [result("movie", 12, 100)] }));
  assert.equal((await episodeLike.match(parseMatchMetadata({ media: { title: "Chapter", artist: "Unknown local show", album: null, duration: 6000 }, pageTitle: "" }))).status, "unmatched", "distinct show metadata prevents episode-to-movie misclassification");
  const shortMovie = createTraktMatcher(client({ "movie:Short": [result("movie", 13, 45)] }));
  assert.equal((await shortMovie.match(parseMatchMetadata({ media: { title: "Short", artist: null, album: null, duration: 2700 }, pageTitle: "" }))).status, "unmatched", "short generic media is not silently treated as a movie");
  const wrongRuntime = createTraktMatcher(client({ "movie:Long film": [result("movie", 11, 180)] }));
  assert.equal((await wrongRuntime.match(parseMatchMetadata({ media: { title: "Long film", artist: null, album: null, duration: 3600 }, pageTitle: "" }))).status, "unmatched", "movie runtime mismatch prevents false match");
  const episode = createTraktMatcher(client({ "show:Nom localisé": [result("show", 20)] }));
  assert.equal((await episode.match(parseMatchMetadata({ media: { title: "S01E03", artist: "Nom localisé", album: null }, pageTitle: "" }))).item.traktId, 99);
  const reportedCrunchyroll = createTraktMatcher(client(
    {
      "show:Golden Kamui": [],
      "show~Golden Kamui": [{ type: "show", show: { title: "Golden Kamuy", ids: { trakt: 125628 } } }, { type: "show", show: { title: "Golden Kamuy -The Hunt of Prisoners in Hokkaido-", ids: { trakt: 249747 } } }],
    },
    undefined,
    [{ number: 5, episodes: [{
      season: 5, number: 3, number_abs: 52, title: "Le favori de Toskushiro", ids: { trakt: 13882548 },
    }] }],
  ));
  assert.deepEqual(await reportedCrunchyroll.match(parseMatchMetadata({ media: { title: "E52 - Le favori de Toskushiro", artist: "Golden Kamui", album: null }, pageTitle: "" })), { status: "matched", key: "episode:13882548", item: { type: "episode", traktId: 13882548 } });
  const translatedCrunchyroll = createTraktMatcher({
    async searchExact(type, query) { return type === "show" && query === "Golden Kamui" ? [result("show", 125628)] : []; },
    async searchShows() { return []; },
    async seasons() {
      return [{ number: 5, episodes: [{
        season: 5, number: 3, number_abs: 52, title: "Toshizo's Favorite",
        available_translations: ["fr"], ids: { trakt: 13882548 },
      }] }];
    },
    async seasonEpisodes() {
      return [{
        season: 5, number: 3, number_abs: 52, title: "Toshizo's Favorite", ids: { trakt: 13882548 },
        translations: [{ title: "Le favori de Toskushiro", language: "fr", country: "fr" }],
      }];
    },
  });
  assert.equal((await translatedCrunchyroll.match(parseMatchMetadata({
    media: {
      title: "E52 - Le favori de Toskushiro", artist: "Golden Kamui", album: null, language: "fr",
    }, pageTitle: "Crunchyroll",
  }))).item.traktId, 13882548, "localized title confirms translated absolute episode numbering");

  const broadExact = createTraktMatcher(client(
    { "show:Golden Kamuy": [{ type: "show", show: { title: "Golden Kamuy", ids: { trakt: 125628 } } }, { type: "show", show: { title: "Golden Kamuy -The Hunt of Prisoners in Hokkaido-", ids: { trakt: 249747 } } }] },
    undefined,
    [{ episodes: [{ number_abs: 52, title: "Le favori de Toskushiro", ids: { trakt: 13882548 } }] }],
  ));
  assert.equal((await broadExact.match(parseMatchMetadata({
    media: { title: "E52 - Le favori de Toskushiro", artist: "Golden Kamuy", album: null }, pageTitle: "",
  }))).item.traktId, 13882548, "episode title and absolute number disambiguate broad exact results");
  const goldenKamuy = createTraktMatcher(client(
    { "show:Golden Kamuy": [result("show", 20)] },
    undefined,
    [{ number: 5, episodes: [{ season: 5, number: 3, number_abs: 52, ids: { trakt: 5203 } }] }],
  ));
  assert.equal((await goldenKamuy.match(parseMatchMetadata({
    media: { title: "Episode 52", artist: "Golden Kamuy", album: null }, pageTitle: "",
  }))).item.traktId, 5203, "bare E-only label resolves a unique explicit absolute number without inferring a season");
  let seasonLoads = 0;
  const cachedAbsolute = createTraktMatcher({
    async searchExact(type, query) { return type === "show" && query === "Cached Series" ? [result("show", 22)] : []; },
    async searchShows() { return []; },
    async seasons() { seasonLoads++; return [{ episodes: [{ title: "Cached title", number_abs: 52, ids: { trakt: 5203 } }] }]; },
  });
  const cachedMedia = { media: { title: "E52 - Cached title", artist: "Cached Series", album: null }, pageTitle: "" };
  await cachedAbsolute.match(parseMatchMetadata(cachedMedia));
  await cachedAbsolute.match(parseMatchMetadata(cachedMedia));
  assert.equal(seasonLoads, 1, "absolute episode lists are cached per show");
  const duplicateAbsolute = createTraktMatcher(client(
    { "show:Series": [result("show", 21)] },
    undefined,
    [{ episodes: [
      { number_abs: 52, title: "Finale", ids: { trakt: 1 } },
      { number_abs: 52, title: "Finale", ids: { trakt: 2 } },
    ] }],
  ));
  assert.equal((await duplicateAbsolute.match(parseMatchMetadata({
    media: { title: "E52 - Finale", artist: "Series", album: null }, pageTitle: "",
  }))).status, "ambiguous", "duplicate title-confirmed absolute numbers are never guessed");
  const minimalPayload = createTraktMatcher(client({ "show:Series": [result("show", 21)] }, undefined, [{ episodes: [{ season: 5, number: 3, ids: { trakt: 1 } }] }]));
  assert.equal((await minimalPayload.match(parseMatchMetadata({ media: { title: "Episode 52", artist: "Series", album: null }, pageTitle: "" }))).status, "unmatched", "Trakt minimal episode payload cannot resolve absolute numbering");
  const missingAbsolute = createTraktMatcher(client({ "show:Series": [result("show", 21)] }, undefined, [{ episodes: [{ number_abs: null, ids: { trakt: 1 } }] }]));
  assert.equal((await missingAbsolute.match(parseMatchMetadata({ media: { title: "Episode 52", artist: "Series", album: null }, pageTitle: "" }))).status, "unmatched", "missing number_abs never falls back to cumulative arithmetic");
  let requestedKonosubaEpisode;
  const konosuba = createTraktMatcher({
    async searchExact() { return []; },
    async searchShows(query) {
      const main = { type: "show", show: {
        title: "KonoSuba: God's Blessing on This Wonderful World!", ids: { trakt: 103803 },
      } };
      const spinoff = { type: "show", show: {
        title: "KONOSUBA – An Explosion on This Wonderful World!", ids: { trakt: 196186 },
      } };
      return query === "KONOSUBA" ? [main, spinoff] : [spinoff];
    },
    async episode(showId, season, number) {
      requestedKonosubaEpisode = { showId, season, number };
      return { season, number, ids: { trakt: 2455355 } };
    },
    async seasons() { return [{ number: 2, episodes: [{ season: 2, number: 9, ids: { trakt: 2455355 } }] }]; },
  });
  assert.equal((await konosuba.match(parseMatchMetadata({
    media: {
      title: "S2 E9 - Une déesse dans cette station thermale nocive !",
      artist: "KONOSUBA -God's blessing on this wonderful world!", album: null,
    }, pageTitle: "Crunchyroll",
  }))).item.traktId, 2455355, "subtitle-prefix search recovers canonical KONOSUBA show");
  assert.deepEqual(requestedKonosubaEpisode, { showId: 103803, season: 2, number: 9 });

  let requestedMushokuEpisode;
  const mushokuPageTitle = createTraktMatcher({
    async searchExact(type, query) {
      return type === "show" && query === "Mushoku Tensei: Jobless Reincarnation" ? [result("show", 156460)] : [];
    },
    async searchShows() { return []; },
    async episode(showId, season, number) {
      requestedMushokuEpisode = { showId, season, number };
      return { season, number, ids: { trakt: 14270741 } };
    },
    async seasons() { return [{ number: 3, episodes: [{ season: 3, number: 3, ids: { trakt: 14270741 } }] }]; },
  });
  assert.equal((await mushokuPageTitle.match(parseMatchMetadata({
    media: {
      title: "E3 - Paisible quotidien retrouvé",
      artist: "Mushoku Tensei: Jobless Reincarnation", album: null,
    },
    pageTitle: "Saison 3 Paisible quotidien retrouvé - Regardez sur Crunchyroll",
  }))).item.traktId, 14270741, "Crunchyroll localized page title provides explicit season coordinates");
  assert.deepEqual(requestedMushokuEpisode, { showId: 156460, season: 3, number: 3 });

  const seasonalEOnly = createTraktMatcher(client(
    { "show:Series": [result("show", 26)] }, undefined,
    [{ episodes: [
      { season: 1, number: 3, number_abs: 3, title: "Old episode", ids: { trakt: 103 } },
      { season: 2, number: 3, number_abs: 13, title: "Correct episode", ids: { trakt: 203 } },
    ] }],
  ));
  assert.equal((await seasonalEOnly.match(parseMatchMetadata({
    media: { title: "E3 - Correct episode", artist: "Series", album: null }, pageTitle: "",
  }))).item.traktId, 203, "E-only title evidence selects correct season instead of number_abs season one");

  const ambiguous = createTraktMatcher(client({ "movie:Same": [result("movie", 1), result("movie", 2)] }));
  assert.equal((await ambiguous.match(parseMatchMetadata({ media: { title: "Same", artist: null, album: null, duration: 6000 }, pageTitle: "" }))).status, "ambiguous");
  const canonicalTitle = createTraktMatcher(client(
    { "show:Series": [result("show", 23)] }, undefined,
    [{ number: 1, episodes: [{ season: 1, number: 1, title: "A Safe Place", ids: { trakt: 101 } }] }],
  ));
  assert.equal((await canonicalTitle.match(parseMatchMetadata({ media: { title: "A safe place", artist: "Series", album: null }, pageTitle: "" }))).item.traktId, 101,
    "unique canonical episode title resolves coordinates from Trakt");

  let translatedSeasonLoads = 0;
  const translatedTitle = createTraktMatcher({
    async searchExact(type, query) { return type === "show" && query === "Avatar : Le dernier maître de l’air" ? [result("show", 24)] : []; },
    async searchShows() { return []; },
    async seasons() {
      return [{ number: 1, episodes: [{ season: 1, number: 1, title: "Aang", ids: { trakt: 102 } }] }];
    },
    async seasonEpisodes() {
      translatedSeasonLoads++;
      return [{ season: 1, number: 1, title: "Aang", ids: { trakt: 102 }, translations: [{ title: "Un endroit sûr", language: "fr", country: "fr" }] }];
    },
  });
  const translatedMedia = { media: {
    title: "Un endroit sûr", artist: "Avatar : Le dernier maître de l’air", album: null,
    language: "fr", episodeNumber: 1,
  }, pageTitle: "Netflix" };
  assert.equal((await translatedTitle.match(parseMatchMetadata(translatedMedia))).item.traktId, 102, "unique localized episode title resolves through grouped season translations");
  assert.equal((await translatedTitle.match(parseMatchMetadata(translatedMedia))).item.traktId, 102);
  assert.equal(translatedSeasonLoads, 1,
    "missing available_translations falls back to bounded season translation loading and caches it");

  let requestedLanguage;
  const spanishTranslation = createTraktMatcher({
    async searchExact(type, query) { return type === "show" && query === "La casa de papel" ? [result("show", 26)] : []; },
    async searchShows() { return []; },
    async seasons() {
      return [{ number: 1, episodes: [{ season: 1, number: 2, title: "The Mask", available_translations: ["es"], ids: { trakt: 103 } }] }];
    },
    async seasonEpisodes(_showId, _season, language) {
      requestedLanguage = language;
      return [{ number: 2, ids: { trakt: 103 }, translations: [{ title: "La máscara", language: "es", country: "es" }] }];
    },
  });
  assert.equal((await spanishTranslation.match(parseMatchMetadata({
    media: { title: "La máscara", artist: "La casa de papel", album: null, language: "es", episodeNumber: 2 }, pageTitle: "Netflix",
  }))).item.traktId, 103, "translated title matching supports any Trakt two-letter language");
  assert.equal(requestedLanguage, "es");

  const ghostExactShows = [
    { type: "show", show: { title: "Ghost in the Shell: Stand Alone Complex", ids: { trakt: 1090 } } },
    { type: "show", show: { title: "Ghost in the Shell: Arise - Alternative Architecture", ids: { trakt: 97286 } } },
    { type: "show", show: { title: "Ghost in the Shell: SAC_2045", ids: { trakt: 154401 } } },
  ];
  const ghostEpisodeRequests = [];
  const ghostBroadQueries = [];
  const ghostInTheShell = createTraktMatcher({
    async searchExact(type, query) {
      return type === "show" && query === "THE GHOST IN THE SHELL" ? ghostExactShows : [];
    },
    async searchShows(query) {
      ghostBroadQueries.push(query);
      return [
        { type: "show", show: { title: "THE GHOST IN THE SHELL", ids: { trakt: 241679 } } },
        ...ghostExactShows,
      ];
    },
    async episode(showId, season, number) {
      ghostEpisodeRequests.push({ showId, season, number });
      return { season, number, ids: { trakt: 241680 } };
    },
    async seasons() { return [{ number: 1, episodes: [{ season: 1, number: 1, ids: { trakt: 241680 } }] }]; },
    async seasonEpisodes() { return []; },
  });
  assert.deepEqual(await ghostInTheShell.match(parseMatchMetadata({
    media: {
      title: "S1E1 - ÉPISODE 01 : PROLOGUE + SUPER SPARTAN i THE GHOST IN THE SHELL",
      artist: "THE GHOST IN THE SHELL", album: null, language: "fr",
    },
    pageTitle: "Prime Video: THE GHOST IN THE SHELL - Saison 1",
  })), { status: "matched", key: "episode:241680", item: { type: "episode", traktId: 241680 } },
  "broad canonical result replaces incomplete exact alias results");
  assert.deepEqual(ghostBroadQueries, ["THE GHOST IN THE SHELL"]);
  assert.deepEqual(ghostEpisodeRequests, [{ showId: 241679, season: 1, number: 1 }],
    "legacy exact-search candidates are not queried when broad search recovers direct canonical show");

  const falloutShows = [
    { type: "show", show: { title: "Fallout", year: 2024, ids: { trakt: 163965 } } },
    { type: "show", show: { title: "Operation Buffalo", year: 2020, ids: { trakt: 161803 } } },
    { type: "show", show: { title: "Thirst Trap: The Fame. The Fantasy. The Fallout.", year: 2025, ids: { trakt: 295633 } } },
  ];
  const falloutEpisodes = {
    163965: { season: 1, number: 1, title: "The End", ids: { trakt: 4724475 } },
    161803: { season: 1, number: 1, title: "Episode 1", ids: { trakt: 4156663 } },
    295633: { season: 1, number: 1, title: "The Rise of a TikTok Heartthrob", ids: { trakt: 13434338 } },
  };
  const falloutTranslationLoads = [];
  const fallout = createTraktMatcher({
    async searchExact(type, query) {
      return type === "show" && query === "Fallout" ? falloutShows : [];
    },
    async searchShows() { throw new Error("canonical exact candidate must keep alias candidates"); },
    async episode(showId, season, number) {
      return { ...falloutEpisodes[showId], season, number };
    },
    async seasons(showId) {
      if (showId !== 163965) return [{ number: 1, episodes: [falloutEpisodes[showId]] }];
      return [
        { number: 0, episodes: [{
          season: 0, number: 1, title: "Special", available_translations: ["fr"], ids: { trakt: 4724474 },
        }] },
        { number: 1, episodes: [falloutEpisodes[showId]] },
      ];
    },
    async seasonEpisodes(showId, season, language) {
      falloutTranslationLoads.push({ showId, season, language });
      if (showId !== 163965 || season !== 1 || language !== "fr") return [];
      return [{
        ...falloutEpisodes[showId],
        translations: [{ title: "La Fin", language: "fr", country: "fr" }],
      }];
    },
  });
  assert.deepEqual(await fallout.match(parseMatchMetadata({
    media: { title: "S1E1 - The End", artist: "Fallout", album: null, language: "en" },
    pageTitle: "Prime Video: Fallout - Season 1",
  })), { status: "matched", key: "episode:4724475", item: { type: "episode", traktId: 4724475 } },
  "exact episode title disambiguates identical coordinates across exact show candidates");
  assert.deepEqual(await fallout.match(parseMatchMetadata({
    media: { title: "S1E1 - La Fin", artist: "Fallout", album: null, language: "fr" },
    pageTitle: "Prime Video: Fallout - Saison 1",
  })), { status: "matched", key: "episode:4724475", item: { type: "episode", traktId: 4724475 } },
  "partial translation hints do not hide localized titles from other seasons");
  assert.ok(falloutTranslationLoads.some(({ showId, season, language }) => showId === 163965
    && season === 1 && language === "fr"), "known seasons load despite a partial translation hint");
  assert.equal((await fallout.match(parseMatchMetadata({
    media: { title: "S1E1", artist: "Fallout", album: null, language: null },
    pageTitle: "Prime Video: Fallout - Season 1",
  }))).status, "ambiguous", "coordinates without title evidence never choose among shows");

  function weakMatcher({ ids = [601], catalogue, exact = {}, broad = {} } = {}) {
    return createTraktMatcher({
      async searchExact(type, query) { return type === "show" ? exact[query] || [] : []; },
      async searchShows(query) {
        return broad[query] || ids.map((id) => ({ type: "show", show: {
          title: `Canonical Show ${id}`, ids: { trakt: id },
        } }));
      },
      async episode(showId) { return { ids: { trakt: showId * 10 + 3 } }; },
      async seasons(showId) {
        return catalogue ? catalogue(showId) : [{ number: 4, episodes: [{
          season: 4, number: 3, number_abs: 27, title: "Expected title", ids: { trakt: showId * 10 + 3 },
        }] }];
      },
    });
  }
  const weakObservation = (title, extra = {}) => ({
    media: { title, artist: "Nom français", ...extra }, pageTitle: "",
  });
  for (const [title, extra] of [
    ["S1E3 - Expected title", {}],
    ["E27 - Expected title", {}],
    ["Expected title", { episodeNumber: 3 }],
  ]) {
    assert.equal((await weakMatcher().match(parseMatchMetadata(weakObservation(title, extra)))).item.traktId, 6013,
      "noncanonical broad show requires exact episode title and numeric corroboration");
  }
  for (const [title, extra] of [
    ["S1E3", {}], ["Expected title", {}], ["Wrong title", { episodeNumber: 3 }],
    ["Expected title", { episodeNumber: 27 }],
  ]) {
    assert.equal((await weakMatcher().match(parseMatchMetadata(weakObservation(title, extra)))).status, "unmatched",
      "weak show never uses coordinates alone, title alone, or adapter number as absolute numbering");
  }
  assert.equal((await weakMatcher({ ids: [601, 602] }).match(parseMatchMetadata(weakObservation("Expected title", { episodeNumber: 3 })))).status, "ambiguous",
  "multiple numerically confirmed weak episodes are ambiguous");
  assert.equal((await weakMatcher({ ids: [601, 601, 601, 601] }).match(parseMatchMetadata(weakObservation("E3 - Expected title")))).item.traktId, 6013,
  "duplicate candidates are removed before the three-show limit");
  assert.equal((await weakMatcher({ ids: [601, 602, 603, 604] }).match(parseMatchMetadata(weakObservation("E3 - Expected title")))).status, "ambiguous",
  "more than three distinct weak candidates never silently selects a prefix");
  const incompleteWeak = () => weakMatcher({ catalogue: (showId) => [
    { number: 4, episodes: Array.from({ length: 500 }, (_, index) => ({
      number: index === 0 ? 3 : index + 30, title: index === 0 ? "Expected title" : "Other title",
      ids: { trakt: index === 0 ? showId * 10 + 3 : 80000 + index },
    })) },
  ] });
  assert.equal((await incompleteWeak().match(parseMatchMetadata(weakObservation("E3 - Expected title")))).status, "ambiguous",
    "partial weak catalogue cannot prove uniqueness of numeric title evidence");
  assert.equal((await incompleteWeak().match(parseMatchMetadata(weakObservation("S1E3 - Expected title")))).item.traktId, 6013,
    "positive title plus explicit coordinates remains usable with partial catalogue");
  const strongPreferred = weakMatcher({
    exact: { "Known Show": [{ type: "show", show: { title: "Known Show", ids: { trakt: 602 } } }] },
    catalogue: (showId) => [{ number: 4, episodes: [{
      number: 3, title: showId === 601 ? "Expected title" : "Other title",
      ids: { trakt: showId * 10 + 3 },
    }] }],
  });
  assert.equal((await strongPreferred.match(parseMatchMetadata(weakObservation("E3 - Expected title", { album: "Known Show" })))).status,
    "unmatched", "weak candidates never replace an unresolved strong show");
  assert.equal((await weakMatcher({ ids: [] }).match(parseMatchMetadata(weakObservation("E3 - Expected title")))).status,
    "unmatched", "an unindexed localized show remains unresolved");

  const numericWeak = weakMatcher({ catalogue: () => [{ number: 4, episodes: [
    { number: 3, title: "Expected title", ids: { trakt: 6013 } },
    { number: 8, title: "Expected title", ids: { trakt: 6018 } },
  ] }] });
  assert.equal((await numericWeak.match(parseMatchMetadata(weakObservation("E3 - Expected title")))).item.traktId, 6013,
    "numeric confirmation disambiguates repeated exact titles for a weak show");
  const duplicatedStrong = weakMatcher({ exact: {
    "Nom français": Array.from({ length: 4 }, () => result("show", 601)),
  } });
  assert.equal((await duplicatedStrong.match(parseMatchMetadata(weakObservation("S1E3")))).item.traktId, 6013,
    "duplicate exact strong aliases are removed before the three-show limit");
  const tooManyStrong = weakMatcher({ exact: {
    "Nom français": [601, 602, 603, 604].map((id) => result("show", id)),
  } });
  assert.equal((await tooManyStrong.match(parseMatchMetadata(weakObservation("S1E3 - Expected title")))).status, "ambiguous",
    "more than three distinct strong candidates remains ambiguous");
  const weakPrefix = weakMatcher({ ids: [], broad: {
    "Nom français: Partie": [result("show", 601)],
    "Nom français": [result("show", 601)],
  } });
  assert.equal((await weakPrefix.match(parseMatchMetadata(weakObservation("E3 - Expected title", {
    artist: "Nom français: Partie",
  })))).item.traktId, 6013, "weak results from existing full and prefix variants are deduplicated");

  const blacklistShows = [
    { type: "show", show: { title: "Blacklist", ids: { trakt: 209540 } } },
    { type: "show", show: { title: "The Blacklist", ids: { trakt: 46676 } } },
    { type: "show", show: { title: "The Blacklist: Redemption", ids: { trakt: 107806 } } },
  ];
  const blacklist = createTraktMatcher({
    async searchExact(type, query) { return type === "show" && query === "Blacklist" ? blacklistShows : []; },
    async searchShows() { return []; },
    async seasons(showId) {
      const episodes = {
        209540: { number: 2, title: "Pilot" },
        46676: { number: 1, title: "Pilot" },
        107806: { number: 1, title: "Leland Bray" },
      };
      return [{ episodes: [{
        season: 1, ...episodes[showId], ids: { trakt: showId + 1 },
      }] }];
    },
  });
  assert.equal((await blacklist.match(parseMatchMetadata({
    media: { title: "Pilot", artist: "Blacklist", album: null, episodeNumber: 1 }, pageTitle: "Netflix",
  }))).item.traktId, 46677,
    "strict episode title and number win before title-only fallback across exact show collisions");

  const collidingShows = createTraktMatcher({
    async searchExact(type, query) {
      return type === "show" && query === "Avatar" ? [result("show", 30), result("show", 31)] : [];
    },
    async searchShows() { return []; },
    async seasons(showId) {
      return [{ episodes: [{ title: showId === 30 ? "Un endroit sûr" : "The Boy in the Iceberg", ids: { trakt: showId === 30 ? 301 : 311 } }] }];
    },
  });
  assert.equal((await collidingShows.match(parseMatchMetadata({ media: { title: "Un endroit sûr", artist: "Avatar", album: null }, pageTitle: "" }))).item.traktId, 301,
    "unique episode title disambiguates colliding show titles");

  const duplicateTitle = createTraktMatcher(client(
    { "show:Series": [result("show", 25)] }, undefined,
    [{ episodes: [
      { season: 1, number: 1, title: "Home", ids: { trakt: 201 } },
      { season: 2, number: 2, title: "Home", ids: { trakt: 202 } },
    ] }],
  ));
  assert.equal((await duplicateTitle.match(parseMatchMetadata({ media: { title: "Home", artist: "Series", album: null }, pageTitle: "" }))).status, "ambiguous",
    "duplicate episode titles across a show are never guessed");
  assert.equal((await duplicateTitle.match(parseMatchMetadata({
    media: { title: "Home", artist: "Series", album: null, episodeNumber: 2 }, pageTitle: "",
  }))).item.traktId, 202, "within-season episode number disambiguates duplicate titles");
  assert.equal((await duplicateTitle.match(parseMatchMetadata({
    media: { title: "Home", artist: "Series", album: null, episodeNumber: 3 }, pageTitle: "",
  }))).status, "ambiguous", "number mismatch falls back to title but duplicate titles remain ambiguous");

  const uniqueTitleWrongNumber = createTraktMatcher(client(
    { "show:Mushoku Tensei: Jobless Reincarnation": [result("show", 27)] }, undefined,
    [{ episodes: [{ season: 3, number: 4, title: "Unique episode title", ids: { trakt: 304 } }] }],
  ));
  assert.equal((await uniqueTitleWrongNumber.match(parseMatchMetadata({
    media: {
      title: "Unique episode title", artist: "Mushoku Tensei: Jobless Reincarnation",
      album: null, episodeNumber: 3,
    }, pageTitle: "Crunchyroll",
  }))).item.traktId, 304, "unique exact title safely wins when provider and Trakt episode numbers differ");

  const errorWithStatus = (status) => Object.assign(new Error(`HTTP ${status}`), { status });
  const entry = (id, title, number = 2, season = 2) => ({ season, number, title, ids: { trakt: id } });
  function evidenceClient(overrides = {}) {
    return {
      async searchExact(type) { return type === "show" ? [result("show", 80)] : []; },
      async searchShows() { return []; },
      async episode() { return entry(900, "Other episode", 27, 1); },
      async seasons() { return [{ number: 2, episodes: [entry(202, "Expected title")] }]; },
      async seasonEpisodes() { return []; },
      ...overrides,
    };
  }
  const observed = (title = "S01E27 - Expected title", extra = {}) => ({
    media: { title, artist: "Series", ...extra }, pageTitle: "",
  });
  for (const absentCoordinates of [false, true]) {
    const matcher = createTraktMatcher(evidenceClient(absentCoordinates
      ? { async episode() { throw errorWithStatus(404); } } : {}));
    assert.equal((await matcher.match(parseMatchMetadata(observed()))).item.traktId, 202,
      "global exact title repairs missing or incorrect provider coordinates");
  }
  const repairedFrench = createTraktMatcher(evidenceClient({
    async seasonEpisodes() { return [{ ...entry(202, "Expected title"),
      translations: [{ language: "fr", title: "Titre attendu" }] }]; },
  }));
  assert.equal((await repairedFrench.match(parseMatchMetadata(observed("S01E27 - Titre attendu", { language: "fr" })))).item.traktId, 202);
  for (const translations of [undefined, [], [{ language: "fr", title: null }], [{ language: "en", title: "Different" }]]) {
    const matcher = createTraktMatcher(evidenceClient({
      async seasonEpisodes() { return [{ ...entry(202, "Expected title"), translations }]; },
    }));
    assert.equal((await matcher.match(parseMatchMetadata(observed("S01E27 - Titre absent", { language: "fr" })))).item.traktId, 900,
      "missing localized evidence never contradicts unique coordinates");
  }
  for (const endpoint of ["seasons", "seasonEpisodes"]) {
    const matcher = createTraktMatcher(evidenceClient({ async [endpoint]() { throw errorWithStatus(404); } }));
    assert.equal((await matcher.match(parseMatchMetadata(observed("S01E27 - Titre absent", { language: "fr" })))).item.traktId, 900);
  }
  const bare = createTraktMatcher(evidenceClient({
    async seasons() { throw new Error("bare labels have no title evidence"); },
  }));
  assert.equal((await bare.match(parseMatchMetadata(observed("S01E27")))).item.traktId, 900);
  assert.equal((await bare.match(parseMatchMetadata(observed("Series")))).status, "needsEpisode", "show hint is not an episode title");
  const canonicalTranslationCollision = createTraktMatcher(evidenceClient({
    async episode() { throw errorWithStatus(404); },
    async seasons() { return [{ number: 2, episodes: [entry(201, "Home", 1), entry(202, "Other", 2)] }]; },
    async seasonEpisodes() { return [{ ...entry(202, "Other"), translations: [{ language: "fr", title: "Home" }] }]; },
  }));
  assert.equal((await canonicalTranslationCollision.match(parseMatchMetadata(observed("Home", { language: "fr" })))).status, "ambiguous");
  assert.equal((await canonicalTranslationCollision.match(parseMatchMetadata(observed("Home", { language: "fr", episodeNumber: 2 })))).item.traktId, 202);
  for (const endpoint of ["episode", "seasons", "seasonEpisodes"]) {
    for (const status of [401, 429, 500]) {
      const matcher = createTraktMatcher(evidenceClient({ async [endpoint]() { throw errorWithStatus(status); } }));
      await assert.rejects(matcher.match(parseMatchMetadata(observed(undefined, { language: "fr" }))), (error) => error.status === status);
    }
  }
  for (const boundary of ["episodes", "seasons", "total", "languages", "translated"]) {
    let loads = 0;
    const catalogue = boundary === "seasons"
      ? Array.from({ length: 200 }, (_, number) => ({ number, episodes: number === 2 ? [entry(202, "Expected title")] : [] }))
      : boundary === "total"
        ? Array.from({ length: 10 }, (_, season) => ({ number: season, episodes: Array.from({ length: 500 }, (_, number) => entry(202 + season * 500 + number, number === 0 && season === 0 ? "Expected title" : "Other", number + 1, season)) }))
        : boundary === "languages"
          ? Array.from({ length: 51 }, (_, season) => ({ number: season, episodes: [entry(202 + season, season === 0 ? "Expected title" : "Other", 2, season)] }))
          : [{ number: 2, episodes: boundary === "episodes"
            ? Array.from({ length: 500 }, (_, number) => entry(202 + number, number === 0 ? "Expected title" : "Other", number + 1))
            : [entry(202, "Expected title")] }];
    const matcher = createTraktMatcher(evidenceClient({
      async seasons() { loads++; return catalogue; },
      async seasonEpisodes() { return boundary === "translated"
        ? Array.from({ length: 500 }, (_, number) => entry(202 + number, number === 0 ? "Expected title" : "Other", number + 1))
        : []; },
    }));
    const input = observed(undefined, { language: "fr" });
    assert.equal((await matcher.match(parseMatchMetadata(input))).status, "ambiguous", `${boundary} boundary cannot prove uniqueness`);
    assert.equal((await matcher.match(parseMatchMetadata(input))).status, "ambiguous");
    assert.equal(loads, 1, "bounded catalogues remain shared and cached");
    const confirmed = createTraktMatcher(evidenceClient({
      async episode() { return entry(202, "Expected title", 27, 1); },
      async seasons() { return catalogue; },
      async seasonEpisodes() { return []; },
    }));
    assert.equal((await confirmed.match(parseMatchMetadata(input))).item.traktId, 202, "title-coordinate intersection survives truncation");
  }
  for (const endpoint of ["seasons", "seasonEpisodes"]) {
    let attempts = 0;
    const matcher = createTraktMatcher(evidenceClient({
      async [endpoint]() {
        if (++attempts === 1) throw errorWithStatus(429);
        return endpoint === "seasons" ? [{ number: 2, episodes: [entry(202, "Expected title")] }] : [];
      },
    }));
    const input = observed(undefined, { language: "fr" });
    await assert.rejects(matcher.match(parseMatchMetadata(input)), (error) => error.status === 429);
    assert.equal((await matcher.match(parseMatchMetadata(input))).item.traktId, 202, "failed shared catalogue promise can reload");
    assert.equal(attempts, 2);
  }
  const splitSeason = createTraktMatcher(evidenceClient({
    async seasons() { return [{ number: 4, episodes: [entry(403, "Titre", 3, 4)] }]; },
  }));
  assert.equal((await splitSeason.match(parseMatchMetadata({ media: { title: "E3 - Titre", artist: "Series", album: "Season 2: Part 2" }, pageTitle: "" }))).item.traktId, 403);
  assert.equal((await splitSeason.match(parseMatchMetadata({ media: { title: "E3", artist: "Series", album: "Season 2: Part 2" }, pageTitle: "" }))).status, "unmatched");
  let sharedLoads = 0;
  const shared = createTraktMatcher(evidenceClient({
    async seasons() { sharedLoads++; await Promise.resolve(); return [{ number: 2, episodes: [entry(202, "Expected title")] }]; },
  }));
  const sharedResults = await Promise.all([shared.match(parseMatchMetadata(observed())), shared.match(parseMatchMetadata(observed()))]);
  assert.deepEqual(sharedResults.map((value) => value.item.traktId), [202, 202]);
  assert.equal(sharedLoads, 1, "concurrent observations share the catalogue promise");
  let boundedLoads = 0;
  const boundedCache = createTraktMatcher(evidenceClient({
    async searchExact(type, query) { return type === "show" ? [result("show", Number(query))] : []; },
    async seasons() { boundedLoads++; return [{ number: 2, episodes: [entry(202, "Expected title")] }]; },
  }));
  for (let id = 1; id <= 21; id++) await boundedCache.match(parseMatchMetadata(observed(undefined, { artist: String(id) })));
  await boundedCache.match(parseMatchMetadata(observed(undefined, { artist: "1" })));
  assert.equal(boundedLoads, 22, "canonical cache evicts beyond twenty shows");
  let translatedLoads = 0;
  const boundedTranslations = createTraktMatcher(evidenceClient({
    async seasonEpisodes() { translatedLoads++; return []; },
  }));
  const languages = Array.from({ length: 41 }, (_, index) => `${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`);
  for (const language of languages) await boundedTranslations.match(parseMatchMetadata(observed(undefined, { language })));
  await boundedTranslations.match(parseMatchMetadata(observed(undefined, { language: languages[0] })));
  assert.equal(translatedLoads, 42, "translation cache evicts beyond forty show-language pairs");
  const originalTitle = createTraktMatcher(evidenceClient({
    async seasons() { return [{ number: 2, episodes: [{ ...entry(202, "Canonical"), original_title: "Expected title" }] }]; },
  }));
  assert.equal((await originalTitle.match(parseMatchMetadata(observed()))).item.traktId, 202, "original titles provide exact evidence");
  const translatedTotal = createTraktMatcher(evidenceClient({
    async seasons() { return Array.from({ length: 11 }, (_, season) => ({ number: season, episodes: [entry(1000 + season, "Other", 1, season)] })); },
    async seasonEpisodes(_show, season) {
      return Array.from({ length: 499 }, (_, number) => entry(202 + season * 499 + number,
        season === 0 && number === 0 ? "Expected title" : "Other", number + 1, season));
    },
  }));
  assert.equal((await translatedTotal.match(parseMatchMetadata(observed(undefined, { language: "fr" })))).status, "ambiguous",
    "five-thousand translated episodes cannot prove a global correction");
  const truncatedAbsent = createTraktMatcher(evidenceClient({
    async seasons() { return [{ number: 2, episodes: Array.from({ length: 500 }, (_, index) => entry(2000 + index, "Other", index + 1)) }]; },
  }));
  assert.equal((await truncatedAbsent.match(parseMatchMetadata(observed()))).item.traktId, 900,
    "empty incomplete title evidence still preserves unique coordinates");
  for (const original of [false, true]) {
    const directConfirmed = createTraktMatcher(evidenceClient({
      async episode() {
        return { ...entry(900, original ? "Canonical title" : "Expected title", 27, 1),
          ...(original ? { original_title: "Expected title" } : {}) };
      },
      async seasons() {
        return [{ number: 2, episodes: Array.from({ length: 500 }, (_, index) =>
          entry(202 + index, index === 0 ? "Expected title" : "Other", index + 1)) }];
      },
    }));
    assert.equal((await directConfirmed.match(parseMatchMetadata(observed()))).item.traktId, 900,
      "direct canonical or original title confirms coordinates omitted from a truncated catalogue");
  }
  const multipleDirectCandidates = createTraktMatcher(evidenceClient({
    async searchExact(type) {
      return type === "show" ? [result("show", 80), result("show", 81)] : [];
    },
    async episode(showId) {
      return entry(showId === 80 ? 900 : 901, showId === 80 ? "Expected title" : "Other episode", 27, 1);
    },
    async seasons() { throw errorWithStatus(404); },
  }));
  assert.equal((await multipleDirectCandidates.match(parseMatchMetadata(observed()))).item.traktId, 900,
    "direct title evidence selects the uniquely confirmed coordinate candidate despite missing catalogues");

  function allLanguageClient(overrides = {}) {
    const calls = [];
    const guardian = { ...entry(2003, "Black Guardian", 3, 2), number_abs: 173 };
    const pilot = entry(1001, "Pilot", 1, 1);
    const api = {
      async searchExact(type) {
        return type === "show" ? [{ type: "show", show: { title: "Black Clover", ids: { trakt: 121959 } } }] : [];
      },
      async searchShows() { return []; },
      async episode() { throw errorWithStatus(404); },
      async seasons() {
        return [{ number: 1, episodes: [pilot] }, { number: 2, episodes: [guardian] }];
      },
      async seasonEpisodes(_showId, season, language) {
        return season === 2 ? [{
          ...guardian,
          translations: language === "all" ? [
            { language: "fr", country: "fr", title: "Le gardien noir", overview: "Not matching evidence" },
            { language: "fr", country: "ca", title: "Le gardien noir" },
            { language: "de", title: null },
          ] : [],
        }] : [pilot];
      },
      ...overrides,
    };
    const loadSeason = api.seasonEpisodes;
    api.seasonEpisodes = async (showId, season, language) => {
      calls.push({ showId, season, language });
      return loadSeason(showId, season, language);
    };
    return { api, calls };
  }
  const cloverObservation = (language = "en", pageTitle = "", extra = {}) => ({
    media: { title: "E173-Le gardien noir", artist: "Black Clover", language, ...extra }, pageTitle,
  });
  for (const language of ["en", null]) {
    for (const pageTitle of ["", "Black Clover Saison 2"]) {
      const { api, calls } = allLanguageClient();
      const matcher = createTraktMatcher(api);
      assert.equal((await matcher.match(parseMatchMetadata(cloverObservation(language, pageTitle)))).item.traktId, 2003,
        "all-language exact title repairs a wrong page season without converting E173 to seasonal coordinates");
      assert.deepEqual(calls.filter((call) => call.language === "all").map((call) => call.season), [1, 2],
        "all languages load once per known season, even without available_translations hints");
      assert.ok(calls.every((call) => call.language === "all" || call.language === language),
        "translation fallback never loops through individual languages");
    }
  }
  for (const translations of [undefined, [], [{ language: "fr", title: null }], [{ language: "fr", title: "Different", overview: "Le gardien noir" }]]) {
    const { api } = allLanguageClient({
      async seasonEpisodes() { return [{ ...entry(2003, "Black Guardian", 3), number_abs: 173, translations }]; },
    });
    assert.equal((await createTraktMatcher(api).match(parseMatchMetadata(cloverObservation()))).item.traktId, 2003,
      "absent all-language title evidence permits the final unique canonical absolute-number fallback");
  }
  const cloverDuplicates = allLanguageClient({
    async seasonEpisodes(_showId, season, language) {
      if (language !== "all" || season !== 2) return [];
      return [3, 4].map((number) => ({
        ...entry(2000 + number, "Different", number), number_abs: 173,
        translations: [{ language: "fr", title: "Le gardien noir" }],
      }));
    },
  });
  assert.equal((await createTraktMatcher(cloverDuplicates.api).match(parseMatchMetadata(cloverObservation()))).status, "ambiguous",
    "same translated title and absolute number on different episode IDs remains ambiguous");
  const numberedTranslations = allLanguageClient({
    async seasonEpisodes(_showId, season, language) {
      return language === "all" && season === 2 ? [3, 4].map((number) => ({
        ...entry(2000 + number, "Different", number), number_abs: 170 + number,
        translations: [{ language: "fr", title: "Le gardien noir" }],
      })) : [];
    },
  });
  assert.equal((await createTraktMatcher(numberedTranslations.api).match(parseMatchMetadata(cloverObservation()))).item.traktId, 2003,
    "numeric evidence disambiguates repeated all-language titles");
  for (const [title, episodeNumber, expected] of [
    ["E173-Le gardien noir", undefined, "matched"],
    ["Le gardien noir", 3, "matched"],
    ["Le gardien noir", undefined, "unmatched"],
    ["Le gardien noir", 173, "unmatched"],
    ["E174-Le gardien noir", undefined, "unmatched"],
  ]) {
    const { api } = allLanguageClient({
      async searchExact() { return []; },
      async searchShows() { return [result("show", 121959)]; },
    });
    assert.equal((await createTraktMatcher(api).match(parseMatchMetadata(cloverObservation("en", "", {
      title, episodeNumber, artist: "Nom localisé",
    })))).status, expected, "weak all-language matching still requires exact title and the correct numeric kind");
  }
  const ambiguousWeakAll = allLanguageClient({
    async searchExact() { return []; },
    async searchShows() { return [result("show", 121959), result("show", 80)]; },
    async seasons(showId) { return [{ number: 2, episodes: [entry(showId + 2000, "Canonical", 3)] }]; },
    async seasonEpisodes(showId, _season, language) {
      return language === "all" ? [{ ...entry(showId + 2000, "Canonical", 3), number_abs: 173,
        translations: [{ language: "fr", title: "Le gardien noir" }] }] : [];
    },
  });
  assert.equal((await createTraktMatcher(ambiguousWeakAll.api).match(parseMatchMetadata(cloverObservation()))).status, "ambiguous",
    "multiple weak episodes corroborated by all-language title and number remain ambiguous");
  const noFallbackCases = [
    ["unique coordinates", cloverObservation("en", "Black Clover Saison 2"), {
      async episode() { return entry(900, "Other episode", 173); },
    }, "matched"],
    ["canonical title", cloverObservation("en", "", { title: "E173-Black Guardian" }), {}, "matched"],
    ["requested-language title", cloverObservation("fr"), {
      async seasonEpisodes(_showId, season) {
        return season === 2 ? [{ ...entry(2003, "Black Guardian", 3), number_abs: 173,
          translations: [{ language: "fr", title: "Le gardien noir" }] }] : [];
      },
    }, "matched"],
    ["normal title ambiguity", cloverObservation("en", "", { title: "Home" }), {
      async seasons() { return [{ number: 2, episodes: [entry(2003, "Home", 3), entry(2004, "Home", 4)] }]; },
    }, "ambiguous"],
    ["coordinate ambiguity", cloverObservation("en", "Black Clover Saison 2"), {
      async searchExact() { return [result("show", 1), result("show", 2)]; },
      async episode(showId) { return entry(900 + showId, "Other episode", 173); },
    }, "ambiguous"],
    ["unresolved show ambiguity", cloverObservation("en"), {
      async searchExact() { return [result("show", 1), result("show", 2)]; },
    }, "ambiguous"],
    ["bare label", cloverObservation("en", "", { title: "E173" }), {}, "matched"],
    ["show title is not episode title", cloverObservation("en", "", { title: "Black Clover" }), {}, "needsEpisode"],
    ["no show candidates", cloverObservation("en"), {
      async searchExact() { return []; },
    }, "unmatched"],
    ["missing canonical catalogue", cloverObservation("en"), {
      async seasons() { throw errorWithStatus(404); },
    }, "unmatched"],
    ["too many shows", cloverObservation("en"), {
      async searchExact() { return [1, 2, 3, 4].map((id) => result("show", id)); },
    }, "ambiguous"],
  ];
  for (const [name, input, overrides, expected] of noFallbackCases) {
    const { api, calls } = allLanguageClient(overrides);
    assert.equal((await createTraktMatcher(api).match(parseMatchMetadata(input))).status, expected, name);
    assert.ok(!calls.some((call) => call.language === "all"), `${name} does not trigger multilingual fallback`);
  }
  const preferredAllTier = allLanguageClient({
    async searchExact(_type, query) { return query === "Known Show" ? [result("show", 80)] : []; },
    async searchShows() { return [result("show", 121959)]; },
    async seasons(showId) { return [{ number: 2, episodes: [entry(showId === 80 ? 8003 : 2003, "Other", 3)] }]; },
    async seasonEpisodes(showId, _season, language) {
      return showId === 121959 && language === "all" ? [{
        ...entry(2003, "Other", 3), number_abs: 173,
        translations: [{ language: "fr", title: "Le gardien noir" }],
      }] : [];
    },
  });
  assert.equal((await createTraktMatcher(preferredAllTier.api).match(parseMatchMetadata(cloverObservation("en", "", { album: "Known Show", artist: "Nom français" })))).status, "unmatched");
  assert.ok(preferredAllTier.calls.every((call) => call.showId === 80),
    "all-language fallback never mixes weak shows into the selected strong tier");
  let cloverSeasonLoads = 0;
  const cachedAll = allLanguageClient({
    async seasons() {
      cloverSeasonLoads++;
      await Promise.resolve();
      return [{ number: 2, episodes: [{ ...entry(2003, "Black Guardian", 3), number_abs: 173 }] }];
    },
  });
  const cachedAllMatcher = createTraktMatcher(cachedAll.api);
  const concurrentAll = await Promise.all([
    cachedAllMatcher.match(parseMatchMetadata(cloverObservation())), cachedAllMatcher.match(parseMatchMetadata(cloverObservation())),
  ]);
  assert.deepEqual(concurrentAll.map((value) => value.item.traktId), [2003, 2003]);
  assert.equal((await cachedAllMatcher.match(parseMatchMetadata(cloverObservation(null)))).item.traktId, 2003);
  assert.equal(cloverSeasonLoads, 1);
  assert.equal(cachedAll.calls.filter((call) => call.language === "all").length, 1,
    "concurrent and different-language observations share one show:all promise");
  for (const status of [401, 429, 500, null]) {
    let allAttempts = 0;
    const failure = status === null ? new Error("Network unavailable") : errorWithStatus(status);
    const { api } = allLanguageClient({
      async seasons() { return [{ number: 2, episodes: [entry(2003, "Black Guardian", 3)] }]; },
      async seasonEpisodes(_showId, _season, language) {
        if (language !== "all") return [];
        if (++allAttempts === 1) throw failure;
        return [{ ...entry(2003, "Black Guardian", 3), number_abs: 173,
          translations: [{ language: "fr", title: "Le gardien noir" }] }];
      },
    });
    const matcher = createTraktMatcher(api);
    await assert.rejects(matcher.match(parseMatchMetadata(cloverObservation())), (error) => error === failure,
      "all-language non-404 errors propagate unchanged");
    assert.equal((await matcher.match(parseMatchMetadata(cloverObservation()))).item.traktId, 2003);
    assert.equal(allAttempts, 2, "failed all-language promise is evicted for a later observation");
  }
  const missingAll = allLanguageClient({
    async seasonEpisodes(_showId, _season, language) {
      if (language === "all") throw errorWithStatus(404);
      return [];
    },
  });
  assert.equal((await createTraktMatcher(missingAll.api).match(parseMatchMetadata(cloverObservation()))).item.traktId, 2003,
    "404 from all translations leaves a complete canonical absolute-number match usable");
  const recoveredLanguage404 = allLanguageClient({
    async seasonEpisodes(_showId, season, language) {
      if (language !== "all") throw errorWithStatus(404);
      return season === 2 ? [{ ...entry(2003, "Black Guardian", 3), number_abs: 173,
        translations: [{ language: "fr", title: "Le gardien noir" }] }] : [];
    },
  });
  assert.equal((await createTraktMatcher(recoveredLanguage404.api).match(parseMatchMetadata(cloverObservation("fr")))).item.traktId, 2003,
    "complete all-language evidence can resolve an absent requested-language catalogue");
  const partialAll404 = allLanguageClient({
    async seasonEpisodes(_showId, season, language) {
      if (language !== "all") return [];
      if (season === 1) throw errorWithStatus(404);
      return [{ ...entry(2003, "Black Guardian", 3), number_abs: 173,
        translations: [{ language: "fr", title: "Le gardien noir" }] }];
    },
  });
  assert.equal((await createTraktMatcher(partialAll404.api).match(parseMatchMetadata(cloverObservation()))).status, "ambiguous",
    "a missing season prevents global uniqueness of an all-language title");
  const partialAllConfirmed = allLanguageClient({
    async searchExact() { return []; },
    async searchShows() { return [result("show", 121959)]; },
    async episode() { return entry(2003, "Black Guardian", 173); },
    async seasonEpisodes(_showId, season, language) {
      if (language !== "all") return [];
      if (season === 1) throw errorWithStatus(404);
      return [{ ...entry(2003, "Black Guardian", 3), number_abs: 173,
        translations: [{ language: "fr", title: "Le gardien noir" }] }];
    },
  });
  assert.equal((await createTraktMatcher(partialAllConfirmed.api).match(parseMatchMetadata(cloverObservation("en", "Black Clover Saison 2")))).item.traktId, 2003,
    "exact all-language title plus coordinates confirms a weak episode despite a missing season");
  for (const boundary of ["canonical seasons", "canonical episodes", "canonical total", "all seasons", "all episodes", "all total"]) {
    const manySeasons = boundary === "canonical seasons" ? 200 : boundary === "canonical total" ? 10
      : boundary === "all seasons" ? 51 : boundary === "all total" ? 11 : 1;
    const { api, calls } = allLanguageClient({
      async seasons() {
        return Array.from({ length: manySeasons }, (_, index) => ({
          number: index + 1,
          episodes: Array.from({ length: ["canonical episodes", "canonical total"].includes(boundary) ? 500 : 1 }, (_, number) =>
            entry(10000 + index * 500 + number, "Canonical", number + 1, index + 1)),
        }));
      },
      async seasonEpisodes(_showId, season, language) {
        if (language !== "all") return [];
        const count = boundary === "all episodes" ? 500 : boundary === "all total" ? 499 : 1;
        return Array.from({ length: count }, (_, index) => ({
          ...entry(10000 + season * 500 + index, "Canonical", index + 1, season),
          number_abs: season === 1 && index === 0 ? 173 : null,
          translations: [{ language: "fr", title: season === 1 && index === 0 ? "Le gardien noir" : "Other" }],
        }));
      },
    });
    const matcher = createTraktMatcher(api);
    assert.equal((await matcher.match(parseMatchMetadata(cloverObservation()))).status, "ambiguous",
      `${boundary} cannot prove unique all-language title evidence`);
    const allLoads = calls.filter((call) => call.language === "all").length;
    assert.ok(allLoads <= 50);
    assert.equal((await matcher.match(parseMatchMetadata(cloverObservation()))).status, "ambiguous");
    assert.equal(calls.filter((call) => call.language === "all").length, allLoads,
      "incomplete all-language catalogues still reuse bounded memory cache");
  }
  let allEvictionLoads = 0;
  const allEviction = allLanguageClient({
    async seasons() { return [{ number: 2, episodes: [entry(2003, "Black Guardian", 3)] }]; },
    async seasonEpisodes(_showId, _season, language) {
      if (language === "all") allEvictionLoads++;
      return [{ ...entry(2003, "Black Guardian", 3), number_abs: 173,
        translations: language === "all" ? [{ language: "fr", title: "Le gardien noir" }] : [] }];
    },
  });
  const allEvictionMatcher = createTraktMatcher(allEviction.api);
  assert.equal((await allEvictionMatcher.match(parseMatchMetadata(cloverObservation()))).item.traktId, 2003);
  for (const language of languages) {
    await allEvictionMatcher.match(parseMatchMetadata(cloverObservation(language, "", { title: "Black Guardian" })));
  }
  assert.equal((await allEvictionMatcher.match(parseMatchMetadata(cloverObservation(null)))).item.traktId, 2003);
  assert.equal(allEvictionLoads, 2, "show:all uses the same bounded forty-entry translation cache");

  const blackGuardian = {
    season: 2, number: 3, number_abs: 173, title: "Black Guardian", original_title: "黒き守護者",
    available_translations: ["de", "en", "ja", "ko", "pt"], ids: { trakt: 14546332 },
  };
  const blackCloverSeasons = [{ number: 2, episodes: [blackGuardian] }];
  function absoluteFallbackClient(overrides = {}) {
    return {
      async searchExact(type) {
        return type === "show" ? [{ type: "show", show: { title: "Black Clover", ids: { trakt: 121959 } } }] : [];
      },
      async searchShows() { return []; },
      async episode() { throw errorWithStatus(404); },
      async seasons() { return blackCloverSeasons; },
      async seasonEpisodes() {
        return [{ ...blackGuardian, translations: [
          { language: "en", title: "Black Guardian" }, { language: "ja", title: "黒き守護者" },
        ] }];
      },
      ...overrides,
    };
  }
  const absoluteObservation = (title = "E173 - Le gardien noir", pageTitle = "", extra = {}) => ({
    media: { title, artist: "Black Clover", language: "fr", ...extra }, pageTitle,
  });
  for (const title of ["E173 - Le gardien noir", "E173"]) {
    for (const pageTitle of ["", "Black Clover Saison 2"]) {
      const matcher = createTraktMatcher(absoluteFallbackClient());
      assert.deepEqual(await matcher.match(parseMatchMetadata(absoluteObservation(title, pageTitle))), {
        status: "matched", key: "episode:14546332", item: { type: "episode", traktId: 14546332 },
      }, "reported Black Clover episode resolves explicit number_abs despite missing French and a separate season hint");
    }
  }
  assert.equal((await createTraktMatcher(absoluteFallbackClient()).match(parseMatchMetadata(absoluteObservation(undefined, "", { album: "Saison 2" })))).item.traktId, 14546332,
  "a separate ordinary album season hint does not reinterpret the source E-only label");
  assert.equal((await createTraktMatcher(absoluteFallbackClient()).match(parseMatchMetadata(absoluteObservation(undefined, "", { episodeNumber: 3 })))).item.traktId, 14546332,
  "within-season provider hint 3 does not contradict source E173 absolute numbering for S2E3");
  for (const language of ["fr", "all"]) {
    const matcher = createTraktMatcher(absoluteFallbackClient({
      async seasons() { return [{ number: 2, episodes: [{ ...blackGuardian, number_abs: undefined }] }]; },
      async seasonEpisodes(_showId, _season, code) { return code === language ? [blackGuardian] : []; },
    }));
    assert.equal((await matcher.match(parseMatchMetadata(absoluteObservation(undefined, "Black Clover Saison 2")))).item.traktId, 14546332,
      `complete ${language} catalogue can supply explicit number_abs omitted by complete nested canonical entries`);
  }
  const bareWithoutAbsolute = createTraktMatcher(absoluteFallbackClient({
    async seasons() { return [{ number: 2, episodes: [{ ...blackGuardian, number_abs: undefined }] }]; },
    async seasonEpisodes() { throw new Error("bare labels must not fetch translations for absolute numbers"); },
  }));
  assert.equal((await bareWithoutAbsolute.match(parseMatchMetadata(absoluteObservation("E173")))).status, "unmatched",
    "bare label fallback does not start a new translated catalogue request");
  for (const language of ["fr", "all"]) {
    const matcher = createTraktMatcher(absoluteFallbackClient({
      async seasons() { return [{ number: 2, episodes: [{ ...blackGuardian, number_abs: undefined }] }]; },
      async seasonEpisodes(_showId, _season, code) {
        return code === language ? Array.from({ length: 500 }, (_, index) =>
          index === 0 ? blackGuardian : entry(100000 + index, "Other", index + 1)) : [];
      },
    }));
    assert.equal((await matcher.match(parseMatchMetadata(absoluteObservation()))).status, "ambiguous",
      `incomplete ${language} catalogue cannot prove a numeric ID when canonical entries omit number_abs`);
  }
  const translatedAbsoluteConflict = createTraktMatcher(absoluteFallbackClient({
    async seasonEpisodes() { return [{ ...blackGuardian, ids: { trakt: 14546333 } }]; },
  }));
  assert.equal((await translatedAbsoluteConflict.match(parseMatchMetadata(absoluteObservation()))).status, "ambiguous",
    "different absolute-number IDs across canonical and translated catalogues remain ambiguous");
  const partialTranslatedConflict = createTraktMatcher(absoluteFallbackClient({
    async seasonEpisodes() {
      return Array.from({ length: 500 }, (_, index) => index === 0
        ? { ...blackGuardian, ids: { trakt: 14546333 } } : entry(100000 + index, "Other", index + 1));
    },
  }));
  assert.equal((await partialTranslatedConflict.match(parseMatchMetadata(absoluteObservation()))).status, "ambiguous",
    "even incomplete translated evidence cannot hide a conflicting absolute-number ID");
  const partialCanonicalNumber = createTraktMatcher(absoluteFallbackClient({
    async seasons() {
      return [{ number: 2, episodes: Array.from({ length: 500 }, (_, index) =>
        index === 0 ? { ...blackGuardian, number_abs: undefined } : entry(100000 + index, "Other", index + 1)) }];
    },
  }));
  assert.equal((await partialCanonicalNumber.match(parseMatchMetadata(absoluteObservation()))).status, "ambiguous",
    "complete translated numeric evidence never repairs an incomplete canonical catalogue");
  const coordinatePriority = createTraktMatcher(absoluteFallbackClient({
    async episode() { return entry(900, "Other episode", 173); },
  }));
  assert.equal((await coordinatePriority.match(parseMatchMetadata(absoluteObservation(undefined, "Black Clover Saison 2")))).item.traktId, 900,
    "already accepted unique ordinary coordinates take priority over a different absolute-number ID");
  for (const titleSource of ["canonical", "requested", "all"]) {
    const otherEpisode = { ...entry(14546333, "Different", 4), number_abs: 174 };
    const matcher = createTraktMatcher(absoluteFallbackClient({
      async seasons() {
        return [{ number: 2, episodes: [blackGuardian, {
          ...otherEpisode, title: titleSource === "canonical" ? "Le gardien noir" : "Different",
        }] }];
      },
      async seasonEpisodes(_showId, _season, language) {
        return [{ ...otherEpisode, translations:
          titleSource === "requested" && language === "fr" || titleSource === "all" && language === "all"
            ? [{ language: "fr", title: "Le gardien noir" }] : [] }];
      },
    }));
    assert.equal((await matcher.match(parseMatchMetadata(absoluteObservation()))).item.traktId, 14546333,
      `${titleSource} exact title on another ID wins over the explicit absolute-number candidate`);
  }
  const conflictingTitle = createTraktMatcher(absoluteFallbackClient({
    async seasons() { return [{ number: 2, episodes: [
      blackGuardian,
      { ...entry(14546333, "Le gardien noir", 4), number_abs: 174 },
      { ...entry(14546334, "Le gardien noir", 5), number_abs: 175 },
    ] }]; },
  }));
  assert.equal((await conflictingTitle.match(parseMatchMetadata(absoluteObservation()))).status, "ambiguous",
    "known exact-title ambiguity is not overridden by an unrelated unique absolute-number candidate");
  for (const [title, pageTitle, extra] of [
    ["S2E173 - Le gardien noir", "", {}],
    ["E173 - Le gardien noir", "S2E173", {}],
    ["E173 - Le gardien noir", "", { album: "S2E173" }],
    ["E173 - Le gardien noir", "", { artist: "Black Clover S2E173" }],
    ["E173 - Le gardien noir", "Saison 2 Episode 173", {}],
    ["E173 - Le gardien noir", "Season 2", { album: "Season 3" }],
    ["E173 - Le gardien noir", "Episode 174", {}],
    ["E173 - Le gardien noir", "S2E174", {}],
    ["E173 - Le gardien noir", "S2E173 S3E173", {}],
    ["E173 E174 - Le gardien noir", "", {}],
    ["Le gardien noir", "", { episodeNumber: 173 }],
    ["Le gardien noir", "Episode 173", {}],
    ["Black Clover", "", { episodeNumber: 173 }],
    [null, "", { episodeNumber: 173 }],
  ]) {
    assert.notEqual((await createTraktMatcher(absoluteFallbackClient()).match(parseMatchMetadata(absoluteObservation(title, pageTitle, extra)))).status, "matched",
    "complete coordinates, conflicting metadata, and absent source E-only labels never enter the absolute fallback");
  }
  const noAbsoluteShow = createTraktMatcher(absoluteFallbackClient({
    async searchExact() { return []; },
  }));
  assert.equal((await noAbsoluteShow.match(parseMatchMetadata(absoluteObservation()))).status, "unmatched",
    "an E-only label cannot invent a show candidate");
  for (const weak of [false, true]) {
    const matcher = createTraktMatcher(absoluteFallbackClient({
      async searchExact() { return weak ? [] : [result("show", 121959), result("show", 121960)]; },
      async searchShows() { return weak ? [result("show", 121959)] : []; },
    }));
    assert.equal((await matcher.match(parseMatchMetadata(absoluteObservation()))).status, weak ? "unmatched" : "ambiguous",
      "absolute-number-only fallback never resolves weak or multiple strong shows");
  }
  const duplicateAbsoluteIds = createTraktMatcher(absoluteFallbackClient({
    async seasons() { return [{ number: 2, episodes: [
      blackGuardian, { ...blackGuardian, ids: { trakt: 14546333 } },
    ] }]; },
  }));
  assert.equal((await duplicateAbsoluteIds.match(parseMatchMetadata(absoluteObservation()))).status, "ambiguous",
    "different IDs sharing number_abs remain ambiguous without any title evidence");
  const duplicateAbsoluteEntries = createTraktMatcher(absoluteFallbackClient({
    async seasons() { return [
      { number: 2, episodes: [blackGuardian, blackGuardian] },
      { number: 2, episodes: [blackGuardian] },
    ]; },
  }));
  assert.equal((await duplicateAbsoluteEntries.match(parseMatchMetadata(absoluteObservation()))).item.traktId, 14546332,
    "repeated entries for the same absolute episode ID do not create false ambiguity");
  for (const boundary of ["episodes", "seasons", "total"]) {
    const seasonCount = boundary === "seasons" ? 200 : boundary === "total" ? 10 : 1;
    const episodeCount = boundary === "seasons" ? 1 : 500;
    for (const hasAbsolute of [false, true]) {
      const matcher = createTraktMatcher(absoluteFallbackClient({
        async seasons() {
          return Array.from({ length: seasonCount }, (_, season) => ({
            number: season,
            episodes: Array.from({ length: episodeCount }, (_, number) =>
              season === 0 && number === 0 && hasAbsolute ? blackGuardian
                : entry(100000 + season * 500 + number, "Other", number + 1, season)),
          }));
        },
        async seasonEpisodes() { return []; },
      }));
      assert.equal((await matcher.match(parseMatchMetadata(absoluteObservation()))).status, hasAbsolute ? "ambiguous" : "unmatched",
        `${boundary} canonical limit cannot prove absolute uniqueness; translated completeness never repairs it`);
    }
  }
  for (const numberAbs of [undefined, null, 0, "173", 174]) {
    const matcher = createTraktMatcher(absoluteFallbackClient({
      async seasons() { return [{ number: 2, episodes: [
        { ...entry(14546330, "Other", 170, 1) },
        { ...blackGuardian, number: 173, number_abs: numberAbs },
      ] }]; },
      async seasonEpisodes() { return []; },
    }));
    assert.equal((await matcher.match(parseMatchMetadata(absoluteObservation()))).status, "unmatched",
      "only an explicit equal integer number_abs qualifies, never a seasonal number or arithmetic conversion");
  }
  let absoluteSeasonLoads = 0;
  const absoluteTranslationLoads = [];
  const cachedNumberOnly = createTraktMatcher(absoluteFallbackClient({
    async seasons() {
      absoluteSeasonLoads++;
      await Promise.resolve();
      return blackCloverSeasons;
    },
    async seasonEpisodes(_showId, _season, language) {
      absoluteTranslationLoads.push(language);
      await Promise.resolve();
      return [];
    },
  }));
  assert.deepEqual((await Promise.all([
    cachedNumberOnly.match(parseMatchMetadata(absoluteObservation())), cachedNumberOnly.match(parseMatchMetadata(absoluteObservation())),
  ])).map((value) => value.item.traktId), [14546332, 14546332]);
  assert.equal((await cachedNumberOnly.match(parseMatchMetadata(absoluteObservation("E173")))).item.traktId, 14546332);
  assert.equal(absoluteSeasonLoads, 1, "numeric fallback reuses the shared canonical promise, including bare labels");
  assert.deepEqual(absoluteTranslationLoads, ["fr", "all"],
    "numeric fallback runs after requested/all title searches without duplicating their cached requests");
  for (const endpoint of ["seasons", "fr", "all"]) {
    for (const status of [401, 429, 500, null]) {
      let attempts = 0;
      const failure = status === null ? new Error("Network unavailable") : errorWithStatus(status);
      const matcher = createTraktMatcher(absoluteFallbackClient({
        async seasons() {
          if (endpoint === "seasons" && ++attempts === 1) throw failure;
          return blackCloverSeasons;
        },
        async seasonEpisodes(_showId, _season, language) {
          if (language === endpoint && ++attempts === 1) throw failure;
          return [];
        },
      }));
      await assert.rejects(matcher.match(parseMatchMetadata(absoluteObservation())), (error) => error === failure,
        "a numeric candidate never suppresses canonical or translation API errors");
      assert.equal((await matcher.match(parseMatchMetadata(absoluteObservation()))).item.traktId, 14546332,
        "failed catalogue promises are evicted so the next observation can retry the numeric fallback");
      assert.equal(attempts, 2);
    }
  }
  const missingEpisode = createTraktMatcher(client({ "show:Series": [result("show", 20)], "movie:Chapter": [result("movie", 30)] }));
  assert.equal((await missingEpisode.match(parseMatchMetadata({ media: { title: "Chapter", artist: "Series", album: null }, pageTitle: "" }))).status, "needsEpisode", "show-like media is not misclassified as movie");
  const structuredMetadata = (overrides) => ({
    title: null, showQueries: [], coordinates: null, absoluteEpisode: null,
    providerEpisodeNumber: null, episodeTitle: null, normalizedEpisodeTitle: "",
    episodeTitleQuery: "", sourceEpisodeNumber: null, hasCompleteCoordinates: false,
    language: null, duration: null, hasDistinctShowHints: false, ...overrides,
  });
  const structuredMovie = createTraktMatcher(client({ "movie:Le Voyage": [result("movie", 10)] }));
  assert.deepEqual(await structuredMovie.match(structuredMetadata({ title: "Le Voyage", duration: 6000 })),
    { status: "matched", key: "movie:10", item: { type: "movie", traktId: 10 } },
    "structured movie metadata resolves without the interpreter");
  const structuredIntersection = createTraktMatcher({
    async searchExact(type, query) { return type === "show" && query === "Black Clover" ? [result("show", 31)] : []; },
    async searchShows() { return []; },
    async episode() { return { season: 2, number: 3, title: "Black Guardian", ids: { trakt: 5003 } }; },
    async seasons() { return [{ number: 2, episodes: [{ season: 2, number: 3, title: "Black Guardian", ids: { trakt: 5003 } }] }]; },
  });
  assert.deepEqual(await structuredIntersection.match(structuredMetadata({
    title: "Black Clover", showQueries: ["Black Clover"], coordinates: { season: 2, episode: 3 },
    episodeTitle: "Black Guardian", normalizedEpisodeTitle: "black guardian",
    episodeTitleQuery: "black guardian", hasCompleteCoordinates: true, language: "fr", duration: 1440,
  })), { status: "matched", key: "episode:5003", item: { type: "episode", traktId: 5003 } },
  "structured title and coordinate intersection resolves without the interpreter");
  const structuredProviderNumber = createTraktMatcher({
    async searchExact(type, query) { return type === "show" && query === "Series" ? [result("show", 32)] : []; },
    async searchShows() { return []; },
    async seasons() { return [{ number: 1, episodes: [{ season: 1, number: 3, number_abs: 173, title: "Other", ids: { trakt: 6001 } }] }]; },
    async seasonEpisodes() { return []; },
  });
  assert.equal((await structuredProviderNumber.match(structuredMetadata({
    title: "Series", showQueries: ["Series"], providerEpisodeNumber: 173, episodeTitle: "Expected title",
    normalizedEpisodeTitle: "expected title", episodeTitleQuery: "expected title", duration: 1440,
  }))).status, "unmatched", "provider within-season hint is never treated as absolute numbering");
  const structuredTranslation = createTraktMatcher({
    async searchExact(type, query) { return type === "show" && query === "Series" ? [result("show", 33)] : []; },
    async searchShows() { return []; },
    async seasons() { return [{ number: 1, episodes: [{
      season: 1, number: 3, title: "Canonical", available_translations: ["fr"], ids: { trakt: 7001 },
    }] }]; },
    async seasonEpisodes() { return [{
      season: 1, number: 3, title: "Canonical", ids: { trakt: 7001 },
      translations: [{ language: "fr", title: "Titre localisé" }],
    }]; },
  });
  assert.equal((await structuredTranslation.match(structuredMetadata({
    title: "Series", showQueries: ["Series"], episodeTitle: "Titre localisé",
    normalizedEpisodeTitle: "titre localise", episodeTitleQuery: "titre localise", language: "fr", duration: 1440,
  }))).item.traktId, 7001, "structured language resolves translated catalogue titles");
  const structuredAbsolute = createTraktMatcher({
    async searchExact(type, query) { return type === "show" && query === "Black Clover" ? [result("show", 34)] : []; },
    async searchShows() { return []; },
    async seasons() { return [{ number: 2, episodes: [{
      season: 2, number: 3, number_abs: 173, title: "Black Guardian", ids: { trakt: 14546332 },
    }] }]; },
  });
  assert.equal((await structuredAbsolute.match(structuredMetadata({
    title: "Black Clover", showQueries: ["Black Clover"], absoluteEpisode: 173,
    sourceEpisodeNumber: 173, hasCompleteCoordinates: false, duration: 1440,
  }))).item.traktId, 14546332,
  "strict structured absolute fallback still requires source and aggregate E-only agreement");
  console.log("Trakt matcher checks: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
