const assert = require("node:assert/strict");
const {
  MANUAL_MATCHES_KEY,
  createManualMatchStore,
  manualMatchIdentity,
} = require("../playback/manual-match-store.js");

let stored = {};
const storage = {
  async get(key) { return { [key]: stored[key] }; },
  async set(value) { Object.assign(stored, value); },
};
const status = (title = "Pilot", progress = 25, tabId = 1) => ({
  kind: "media",
  source: { tabId, frameId: 0, hostname: "www.netflix.com", pageTitle: "Pilot | Netflix" },
  media: {
    title,
    artist: "Example Show",
    album: "Season 1",
    language: "en",
    episodeNumber: 1,
    duration: 2_400,
    progress,
    state: "playing",
  },
});
const correction = {
  item: { type: "episode", traktId: 42 },
  display: { type: "episode", title: "Pilot", showTitle: "Example Show", year: 2025, season: 1, episode: 1 },
};

(async () => {
  assert.equal(manualMatchIdentity({ kind: "empty" }), null);
  assert.equal(
    manualMatchIdentity(status("Pilot", 25, 1)),
    manualMatchIdentity(status("Pilot", 75, 9)),
    "volatile playback and tab state do not change the correction identity",
  );
  assert.notEqual(manualMatchIdentity(status("Pilot")), manualMatchIdentity(status("Episode 2")));

  const store = createManualMatchStore({ storage, now: () => 1_000 });
  assert.equal(await store.get(status()), null);
  assert.deepEqual(await store.set(status(), correction), correction);
  assert.deepEqual(await store.get(status("Pilot", 80, 3)), correction, "saved correction is reused for the same normalized media");
  assert.equal(await store.get(status("Episode 2")), null, "correction cannot leak to another episode");
  assert.ok(stored[MANUAL_MATCHES_KEY]);

  const removed = await store.remove(status());
  assert.equal(removed, true);
  assert.equal(await store.get(status()), null);
  assert.equal(await store.remove(status()), false, "removal is idempotent");
  await assert.rejects(
    () => store.set(status(), { item: { type: "show", traktId: 1 }, display: correction.display }),
    /Invalid manual match/,
  );
  console.log("manual match store checks: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
