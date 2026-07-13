const assert = require("node:assert/strict");
const { createTraktMatcher, parseEpisode, parseAbsoluteEpisode } = require("../trakt/trakt-matcher.js");
assert.deepEqual(parseEpisode(["S02E07 — Title"]), { season: 2, episode: 7 });
assert.deepEqual(parseEpisode(["Saison 3 Épisode 4"]), { season: 3, episode: 4 });
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
    [{ number: 5, episodes: [{ season: 5, number: 3, number_abs: 52, ids: { trakt: 13882548 } }] }],
  ));
  assert.deepEqual(await reportedCrunchyroll.match({ media: { title: "E52 - Le favori de Toskushiro", artist: "Golden Kamui", album: null }, pageTitle: "" }), { status: "matched", key: "episode:13882548", item: { type: "episode", traktId: 13882548 } });
  const broadExact = createTraktMatcher(client(
    { "show:Golden Kamuy": [{ type: "show", show: { title: "Golden Kamuy", ids: { trakt: 125628 } } }, { type: "show", show: { title: "Golden Kamuy -The Hunt of Prisoners in Hokkaido-", ids: { trakt: 249747 } } }] },
    undefined,
    [{ episodes: [{ number_abs: 52, ids: { trakt: 13882548 } }] }],
  ));
  assert.equal((await broadExact.match({ media: { title: "E52", artist: "Golden Kamuy", album: null }, pageTitle: "" })).item.traktId, 13882548, "canonical title disambiguates broad exact results");
  const goldenKamuy = createTraktMatcher(client(
    { "show:Golden Kamuy": [result("show", 20)] },
    undefined,
    [{ number: 5, episodes: [{ season: 5, number: 3, number_abs: 52, ids: { trakt: 5203 } }] }],
  ));
  assert.deepEqual(await goldenKamuy.match({ media: { title: "Episode 52", artist: "Golden Kamuy", album: null }, pageTitle: "" }), { status: "matched", key: "episode:5203", item: { type: "episode", traktId: 5203 } });
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
    [{ episodes: [{ number_abs: 52, ids: { trakt: 1 } }, { number_abs: 52, ids: { trakt: 2 } }] }],
  ));
  assert.equal((await duplicateAbsolute.match({ media: { title: "Episode 52", artist: "Series", album: null }, pageTitle: "" })).status, "ambiguous", "duplicate absolute numbers are never guessed");
  const minimalPayload = createTraktMatcher(client({ "show:Series": [result("show", 21)] }, undefined, [{ episodes: [{ season: 5, number: 3, ids: { trakt: 1 } }] }]));
  assert.equal((await minimalPayload.match({ media: { title: "Episode 52", artist: "Series", album: null }, pageTitle: "" })).status, "unmatched", "Trakt minimal episode payload cannot resolve absolute numbering");
  const missingAbsolute = createTraktMatcher(client({ "show:Series": [result("show", 21)] }, undefined, [{ episodes: [{ number_abs: null, ids: { trakt: 1 } }] }]));
  assert.equal((await missingAbsolute.match({ media: { title: "Episode 52", artist: "Series", album: null }, pageTitle: "" })).status, "unmatched", "missing number_abs never falls back to cumulative arithmetic");
  const ambiguous = createTraktMatcher(client({ "movie:Same": [result("movie", 1), result("movie", 2)] }));
  assert.equal((await ambiguous.match({ media: { title: "Same", artist: null, album: null, duration: 6000 }, pageTitle: "" })).status, "ambiguous");
  const missingEpisode = createTraktMatcher(client({ "show:Series": [result("show", 20)], "movie:Chapter": [result("movie", 30)] }));
  assert.equal((await missingEpisode.match({ media: { title: "Chapter", artist: "Series", album: null }, pageTitle: "" })).status, "needsEpisode", "show-like media is not misclassified as movie");
  console.log("Trakt matcher checks: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
