const assert = require("node:assert/strict");
const { createTraktMatcher, parseEpisode, parseAbsoluteEpisode } = require("../trakt/trakt-matcher.js");
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
  assert.deepEqual(await localized.match({ media: { title: "Le Voyage", artist: null, album: null, duration: 6000 }, pageTitle: "" }), { status: "matched", key: "movie:10", item: { type: "movie", traktId: 10 } });
  const episodeLike = createTraktMatcher(client({ "show:Unknown local show": [], "movie:Chapter": [result("movie", 12, 100)] }));
  assert.equal((await episodeLike.match({ media: { title: "Chapter", artist: "Unknown local show", album: null, duration: 6000 }, pageTitle: "" })).status, "unmatched", "distinct show metadata prevents episode-to-movie misclassification");
  const shortMovie = createTraktMatcher(client({ "movie:Short": [result("movie", 13, 45)] }));
  assert.equal((await shortMovie.match({ media: { title: "Short", artist: null, album: null, duration: 2700 }, pageTitle: "" })).status, "unmatched", "short generic media is not silently treated as a movie");
  const wrongRuntime = createTraktMatcher(client({ "movie:Long film": [result("movie", 11, 180)] }));
  assert.equal((await wrongRuntime.match({ media: { title: "Long film", artist: null, album: null, duration: 3600 }, pageTitle: "" })).status, "unmatched", "movie runtime mismatch prevents false match");
  const episode = createTraktMatcher(client({ "show:Nom localisé": [result("show", 20)] }));
  assert.equal((await episode.match({ media: { title: "S01E03", artist: "Nom localisé", album: null }, pageTitle: "" })).item.traktId, 99);
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
  assert.deepEqual(await reportedCrunchyroll.match({ media: { title: "E52 - Le favori de Toskushiro", artist: "Golden Kamui", album: null }, pageTitle: "" }), { status: "matched", key: "episode:13882548", item: { type: "episode", traktId: 13882548 } });
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
  assert.equal((await translatedCrunchyroll.match({
    media: {
      title: "E52 - Le favori de Toskushiro", artist: "Golden Kamui", album: null, language: "fr",
    }, pageTitle: "Crunchyroll",
  })).item.traktId, 13882548, "localized title confirms translated absolute episode numbering");

  const broadExact = createTraktMatcher(client(
    { "show:Golden Kamuy": [{ type: "show", show: { title: "Golden Kamuy", ids: { trakt: 125628 } } }, { type: "show", show: { title: "Golden Kamuy -The Hunt of Prisoners in Hokkaido-", ids: { trakt: 249747 } } }] },
    undefined,
    [{ episodes: [{ number_abs: 52, title: "Le favori de Toskushiro", ids: { trakt: 13882548 } }] }],
  ));
  assert.equal((await broadExact.match({
    media: { title: "E52 - Le favori de Toskushiro", artist: "Golden Kamuy", album: null }, pageTitle: "",
  })).item.traktId, 13882548, "episode title and absolute number disambiguate broad exact results");
  const goldenKamuy = createTraktMatcher(client(
    { "show:Golden Kamuy": [result("show", 20)] },
    undefined,
    [{ number: 5, episodes: [{ season: 5, number: 3, number_abs: 52, ids: { trakt: 5203 } }] }],
  ));
  assert.equal((await goldenKamuy.match({
    media: { title: "Episode 52", artist: "Golden Kamuy", album: null }, pageTitle: "",
  })).status, "unmatched", "E-only number without episode title evidence never guesses a season");
  let seasonLoads = 0;
  const cachedAbsolute = createTraktMatcher({
    async searchExact(type, query) { return type === "show" && query === "Cached Series" ? [result("show", 22)] : []; },
    async searchShows() { return []; },
    async seasons() { seasonLoads++; return [{ episodes: [{ number_abs: 52, ids: { trakt: 5203 } }] }]; },
  });
  const cachedMedia = { media: { title: "Episode 52", artist: "Cached Series", album: null }, pageTitle: "" };
  await cachedAbsolute.match(cachedMedia);
  await cachedAbsolute.match(cachedMedia);
  assert.equal(seasonLoads, 1, "absolute episode lists are cached per show");
  const duplicateAbsolute = createTraktMatcher(client(
    { "show:Series": [result("show", 21)] },
    undefined,
    [{ episodes: [
      { number_abs: 52, title: "Finale", ids: { trakt: 1 } },
      { number_abs: 52, title: "Finale", ids: { trakt: 2 } },
    ] }],
  ));
  assert.equal((await duplicateAbsolute.match({
    media: { title: "E52 - Finale", artist: "Series", album: null }, pageTitle: "",
  })).status, "ambiguous", "duplicate title-confirmed absolute numbers are never guessed");
  const minimalPayload = createTraktMatcher(client({ "show:Series": [result("show", 21)] }, undefined, [{ episodes: [{ season: 5, number: 3, ids: { trakt: 1 } }] }]));
  assert.equal((await minimalPayload.match({ media: { title: "Episode 52", artist: "Series", album: null }, pageTitle: "" })).status, "unmatched", "Trakt minimal episode payload cannot resolve absolute numbering");
  const missingAbsolute = createTraktMatcher(client({ "show:Series": [result("show", 21)] }, undefined, [{ episodes: [{ number_abs: null, ids: { trakt: 1 } }] }]));
  assert.equal((await missingAbsolute.match({ media: { title: "Episode 52", artist: "Series", album: null }, pageTitle: "" })).status, "unmatched", "missing number_abs never falls back to cumulative arithmetic");
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
  });
  assert.equal((await konosuba.match({
    media: {
      title: "S2 E9 - Une déesse dans cette station thermale nocive !",
      artist: "KONOSUBA -God's blessing on this wonderful world!", album: null,
    }, pageTitle: "Crunchyroll",
  })).item.traktId, 2455355, "subtitle-prefix search recovers canonical KONOSUBA show");
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
  });
  assert.equal((await mushokuPageTitle.match({
    media: {
      title: "E3 - Paisible quotidien retrouvé",
      artist: "Mushoku Tensei: Jobless Reincarnation", album: null,
    },
    pageTitle: "Saison 3 Paisible quotidien retrouvé - Regardez sur Crunchyroll",
  })).item.traktId, 14270741, "Crunchyroll localized page title provides explicit season coordinates");
  assert.deepEqual(requestedMushokuEpisode, { showId: 156460, season: 3, number: 3 });

  const seasonalEOnly = createTraktMatcher(client(
    { "show:Series": [result("show", 26)] }, undefined,
    [{ episodes: [
      { season: 1, number: 3, number_abs: 3, title: "Old episode", ids: { trakt: 103 } },
      { season: 2, number: 3, number_abs: 13, title: "Correct episode", ids: { trakt: 203 } },
    ] }],
  ));
  assert.equal((await seasonalEOnly.match({
    media: { title: "E3 - Correct episode", artist: "Series", album: null }, pageTitle: "",
  })).item.traktId, 203, "E-only title evidence selects correct season instead of number_abs season one");

  const ambiguous = createTraktMatcher(client({ "movie:Same": [result("movie", 1), result("movie", 2)] }));
  assert.equal((await ambiguous.match({ media: { title: "Same", artist: null, album: null, duration: 6000 }, pageTitle: "" })).status, "ambiguous");
  const canonicalTitle = createTraktMatcher(client(
    { "show:Series": [result("show", 23)] }, undefined,
    [{ number: 1, episodes: [{ season: 1, number: 1, title: "A Safe Place", ids: { trakt: 101 } }] }],
  ));
  assert.equal((await canonicalTitle.match({ media: { title: "A safe place", artist: "Series", album: null }, pageTitle: "" })).item.traktId, 101,
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
  assert.equal((await translatedTitle.match(translatedMedia)).item.traktId, 102, "unique localized episode title resolves through grouped season translations");
  assert.equal((await translatedTitle.match(translatedMedia)).item.traktId, 102);
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
  assert.equal((await spanishTranslation.match({
    media: { title: "La máscara", artist: "La casa de papel", album: null, language: "es", episodeNumber: 2 }, pageTitle: "Netflix",
  })).item.traktId, 103, "translated title matching supports any Trakt two-letter language");
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
  });
  assert.deepEqual(await ghostInTheShell.match({
    media: {
      title: "S1E1 - ÉPISODE 01 : PROLOGUE + SUPER SPARTAN i THE GHOST IN THE SHELL",
      artist: "THE GHOST IN THE SHELL", album: null, language: "fr",
    },
    pageTitle: "Prime Video: THE GHOST IN THE SHELL - Saison 1",
  }), { status: "matched", key: "episode:241680", item: { type: "episode", traktId: 241680 } },
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
  assert.deepEqual(await fallout.match({
    media: { title: "S1E1 - The End", artist: "Fallout", album: null, language: "en" },
    pageTitle: "Prime Video: Fallout - Season 1",
  }), { status: "matched", key: "episode:4724475", item: { type: "episode", traktId: 4724475 } },
  "exact episode title disambiguates identical coordinates across exact show candidates");
  assert.deepEqual(await fallout.match({
    media: { title: "S1E1 - La Fin", artist: "Fallout", album: null, language: "fr" },
    pageTitle: "Prime Video: Fallout - Saison 1",
  }), { status: "matched", key: "episode:4724475", item: { type: "episode", traktId: 4724475 } },
  "partial translation hints do not hide localized titles from other seasons");
  assert.ok(falloutTranslationLoads.some(({ showId, season, language }) => showId === 163965
    && season === 1 && language === "fr"), "known seasons load despite a partial translation hint");
  assert.equal((await fallout.match({
    media: { title: "S1E1", artist: "Fallout", album: null, language: null },
    pageTitle: "Prime Video: Fallout - Season 1",
  })).status, "ambiguous", "coordinates without title evidence never choose among shows");

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
  assert.equal((await blacklist.match({
    media: { title: "Pilot", artist: "Blacklist", album: null, episodeNumber: 1 }, pageTitle: "Netflix",
  })).item.traktId, 46677,
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
  assert.equal((await collidingShows.match({ media: { title: "Un endroit sûr", artist: "Avatar", album: null }, pageTitle: "" })).item.traktId, 301,
    "unique episode title disambiguates colliding show titles");

  const duplicateTitle = createTraktMatcher(client(
    { "show:Series": [result("show", 25)] }, undefined,
    [{ episodes: [
      { season: 1, number: 1, title: "Home", ids: { trakt: 201 } },
      { season: 2, number: 2, title: "Home", ids: { trakt: 202 } },
    ] }],
  ));
  assert.equal((await duplicateTitle.match({ media: { title: "Home", artist: "Series", album: null }, pageTitle: "" })).status, "ambiguous",
    "duplicate episode titles across a show are never guessed");
  assert.equal((await duplicateTitle.match({
    media: { title: "Home", artist: "Series", album: null, episodeNumber: 2 }, pageTitle: "",
  })).item.traktId, 202, "within-season episode number disambiguates duplicate titles");
  assert.equal((await duplicateTitle.match({
    media: { title: "Home", artist: "Series", album: null, episodeNumber: 3 }, pageTitle: "",
  })).status, "ambiguous", "number mismatch falls back to title but duplicate titles remain ambiguous");

  const uniqueTitleWrongNumber = createTraktMatcher(client(
    { "show:Mushoku Tensei: Jobless Reincarnation": [result("show", 27)] }, undefined,
    [{ episodes: [{ season: 3, number: 4, title: "Unique episode title", ids: { trakt: 304 } }] }],
  ));
  assert.equal((await uniqueTitleWrongNumber.match({
    media: {
      title: "Unique episode title", artist: "Mushoku Tensei: Jobless Reincarnation",
      album: null, episodeNumber: 3,
    }, pageTitle: "Crunchyroll",
  })).item.traktId, 304, "unique exact title safely wins when provider and Trakt episode numbers differ");

  const missingEpisode = createTraktMatcher(client({ "show:Series": [result("show", 20)], "movie:Chapter": [result("movie", 30)] }));
  assert.equal((await missingEpisode.match({ media: { title: "Chapter", artist: "Series", album: null }, pageTitle: "" })).status, "needsEpisode", "show-like media is not misclassified as movie");
  console.log("Trakt matcher checks: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
