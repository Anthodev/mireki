const assert = require("node:assert/strict");
const { createManualMatchService } = require("../trakt/manual-match-service.js");

const calls = [];
const client = {
  async searchMovies(query) {
    calls.push(["movies", query]);
    return [
      { type: "movie", score: 20, movie: { title: "Arrival", year: 2016, ids: { trakt: 10 } } },
      { type: "movie", score: 1, movie: { title: "Invalid", ids: {} } },
    ];
  },
  async searchShows(query) {
    calls.push(["shows", query]);
    return [{ type: "show", score: 30, show: { title: "Arrival", year: 2024, ids: { trakt: 20 } } }];
  },
  async movie(traktId) {
    calls.push(["movie", traktId]);
    return { title: "Arrival", year: 2016, ids: { trakt: traktId } };
  },
  async show(traktId) {
    calls.push(["show", traktId]);
    return { title: "Example Show", year: 2025, ids: { trakt: traktId } };
  },
  async episode(showId, season, number) {
    calls.push(["episode", showId, season, number]);
    return { title: "Pilot", season, number, ids: { trakt: 42 } };
  },
};

(async () => {
  const service = createManualMatchService(client);
  const results = await service.search("  Arrival  ");
  assert.deepEqual(calls.slice(0, 2), [["movies", "Arrival"], ["shows", "Arrival"]]);
  assert.deepEqual(results, [
    { type: "show", traktId: 20, title: "Arrival", year: 2024 },
    { type: "movie", traktId: 10, title: "Arrival", year: 2016 },
  ], "search returns bounded, validated public fields ordered by Trakt score");
  await assert.rejects(() => service.search(" "), /Invalid search query/);

  assert.deepEqual(await service.resolve({ type: "movie", traktId: 10 }), {
    item: { type: "movie", traktId: 10 },
    display: { type: "movie", title: "Arrival", showTitle: null, year: 2016, season: null, episode: null },
  });
  assert.deepEqual(await service.resolve({ type: "episode", showId: 20, season: 1, episode: 1 }), {
    item: { type: "episode", traktId: 42 },
    display: { type: "episode", title: "Pilot", showTitle: "Example Show", year: 2025, season: 1, episode: 1 },
  });
  await assert.rejects(() => service.resolve({ type: "episode", showId: 20, season: -1, episode: 1 }), /Invalid manual selection/);
  console.log("manual match service checks: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
