const assert = require("node:assert/strict");
const { createTraktClient, TraktApiError } = require("../trakt/trakt-client.js");
const requests = [];
let response = { ok: true, status: 200, headers: { get: () => null }, json: async () => [] };
const client = createTraktClient({ clientId: "public", getAccessToken: async () => "secret-token", fetch: async (url, init) => { requests.push({ url, init }); return response; } });
(async () => {
  await client.searchExact("movie", "Titre français");
  assert.match(requests[0].url, /\/search\/movie\/exact\?query=Titre%20fran%C3%A7ais.*extended=full/);
  assert.equal(requests[0].init.headers.Authorization, "Bearer secret-token");
  assert.equal(requests[0].init.headers["trakt-api-key"], "public");
  response = { ok: true, status: 200, headers: { get: () => null }, json: async () => [] };
  await client.searchShows("Silver Trails");
  assert.match(requests.at(-1).url, /\/search\/show\?query=Silver%20Trails&limit=10&extended=full$/);
  response = { ok: true, status: 200, headers: { get: () => null }, json: async () => [] };
  await client.searchMovies("Arrival");
  assert.match(requests.at(-1).url, /\/search\/movie\?query=Arrival&limit=10&extended=full$/);
  response = { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ title: "Arrival", ids: { trakt: 10 } }) };
  assert.equal((await client.movie(10)).ids.trakt, 10);
  assert.match(requests.at(-1).url, /\/movies\/10\?extended=full$/);
  response = { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ title: "Example Show", ids: { trakt: 20 } }) };
  assert.equal((await client.show(20)).ids.trakt, 20);
  assert.match(requests.at(-1).url, /\/shows\/20\?extended=full$/);
  response = { ok: true, status: 200, headers: { get: () => null }, json: async () => [{ number: 5, episodes: [] }] };
  assert.equal((await client.seasons(20))[0].number, 5);
  assert.match(requests.at(-1).url, /\/shows\/20\/seasons\?extended=episodes,full$/);
  response = { ok: true, status: 200, headers: { get: () => null }, json: async () => [{ season: 1, number: 1, translations: [] }] };
  assert.equal((await client.seasonEpisodes(20, 1, "FR"))[0].number, 1);
  assert.match(requests.at(-1).url, /\/shows\/20\/seasons\/1\?extended=full&translations=fr$/);
  await assert.rejects(() => client.seasonEpisodes(20, 1, "fr-FR"), /Invalid translated season identity/);
  assert.equal((await client.seasonEpisodes(20, 0, "all"))[0].number, 1);
  assert.match(requests.at(-1).url, /\/shows\/20\/seasons\/0\?extended=full&translations=all$/);
  const beforeInvalidTranslations = requests.length;
  for (const language of ["ALL", " all", "all ", "", "fra", "fr,en", "all&extended=full", null, 42]) {
    await assert.rejects(() => client.seasonEpisodes(20, 1, language), /Invalid translated season identity/);
  }
  for (const [showId, season] of [[0, 1], [-1, 1], ["20", 1], [20, -1], [20, 1.5], [20, "1"]]) {
    await assert.rejects(() => client.seasonEpisodes(showId, season, "all"), /Invalid translated season identity/);
  }
  assert.equal(requests.length, beforeInvalidTranslations, "invalid translation inputs never issue a request");
  response = { ok: true, status: 200, headers: { get: () => null }, json: async () => Array.from({ length: 501 }, (_, number) => ({ number })) };
  assert.equal((await client.seasonEpisodes(20, 1, "all")).length, 500, "all-language responses keep the episode bound");
  response = { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ season: 1, number: 3, ids: { trakt: 99 } }) };
  assert.equal((await client.episode(20, 1, 3)).ids.trakt, 99);
  response = { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ season: 2, number: 3, ids: { trakt: 99 } }) };
  await assert.rejects(() => client.episode(20, 1, 3), (error) => error instanceof TraktApiError && error.status === 502);
  response = { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ action: "start" }) };
  await client.scrobble("start", { type: "movie", traktId: 42 }, 12.5);
  assert.deepEqual(JSON.parse(requests.at(-1).init.body), { movie: { ids: { trakt: 42 } }, progress: 12.5 });
  response = { ok: true, status: 201, headers: { get: () => null }, json: async () => ({ action: "pause" }) };
  assert.equal((await client.scrobble("pause", { type: "movie", traktId: 42 }, 50)).action, "pause");
  response = { ok: false, status: 409, headers: { get: () => null }, json: async () => ({}) };
  assert.equal((await client.scrobble("pause", { type: "movie", traktId: 42 }, 50)).duplicate, true, "already-inactive pause is idempotent");
  response = { ok: false, status: 409, headers: { get: () => null }, json: async () => ({ watched_at: "now" }) };
  assert.equal((await client.scrobble("stop", { type: "movie", traktId: 42 }, 90)).duplicate, true);
  response = { ok: false, status: 429, headers: { get: () => "5" }, json: async () => ({}) };
  await assert.rejects(() => client.searchExact("show", "Show"), (error) => error instanceof TraktApiError && error.status === 429 && error.retryAfter > Date.now());
  console.log("Trakt client checks: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
