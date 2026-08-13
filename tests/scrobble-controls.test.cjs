const assert = require("node:assert/strict");
const {
  CONTROL_SETTINGS_KEY,
  CONTROL_SESSION_KEY,
  PROVIDERS,
  createScrobbleControls,
} = require("../playback/scrobble-controls.js");

function createStorage(initial = {}) {
  const values = structuredClone(initial);
  return {
    values,
    async get(key) { return { [key]: structuredClone(values[key]) }; },
    async set(update) { Object.assign(values, structuredClone(update)); },
    async remove(key) { delete values[key]; },
  };
}

const mediaStatus = (title = "Episode one", hostname = "www.netflix.com") => ({
  kind: "media",
  source: { tabId: 4, frameId: 0, hostname, pageTitle: `${title} | Watch` },
  media: {
    title,
    artist: "Example show",
    album: "Season 1",
    language: "en",
    episodeNumber: 1,
    progress: 25,
  },
});

(async () => {
  let now = 10_000;
  const local = createStorage();
  const session = createStorage();
  const controls = createScrobbleControls({ localStorage: local, sessionStorage: session, now: () => now });

  assert.deepEqual(PROVIDERS.map(({ id }) => id), ["crunchyroll", "netflix", "prime-video"]);
  assert.equal((await controls.status(mediaStatus())).mode, "active", "scrobbling is active by default");

  await controls.setGlobalEnabled(false);
  assert.equal((await controls.status(mediaStatus())).mode, "disabled", "global switch blocks every provider");
  assert.deepEqual(local.values[CONTROL_SETTINGS_KEY], {
    globallyEnabled: false,
    disabledProviders: [],
    suspendedUntil: null,
  });
  await controls.setGlobalEnabled(true);

  await controls.setProviderEnabled("netflix", false);
  assert.equal((await controls.status(mediaStatus())).mode, "providerDisabled", "disabled provider is blocked");
  assert.equal((await controls.status(mediaStatus("Episode one", "video.crunchyroll.com"))).mode, "active", "other providers stay active");
  await assert.rejects(() => controls.setProviderEnabled("unknown", false), /provider/i);
  await controls.setProviderEnabled("netflix", true);

  await controls.pause("15m");
  assert.deepEqual(await controls.status(mediaStatus()), {
    mode: "paused",
    providerId: "netflix",
    providerLabel: "Netflix",
    resumeAt: 910_000,
  });
  now = 910_000;
  assert.equal((await controls.status(mediaStatus())).mode, "active", "timed suspension expires at its deadline");
  await controls.clearExpiredPause();
  assert.equal(local.values[CONTROL_SETTINGS_KEY].suspendedUntil, null, "expired suspension is removed from storage");
  await assert.rejects(() => controls.pause("tomorrow"), /duration/i);

  await controls.pause("restart");
  assert.equal((await controls.status(mediaStatus())).mode, "paused");
  assert.equal(session.values[CONTROL_SESSION_KEY].suspendedForSession, true, "restart suspension stays in memory-only storage");
  const afterRestart = createScrobbleControls({ localStorage: local, sessionStorage: createStorage(), now: () => now });
  assert.equal((await afterRestart.status(mediaStatus())).mode, "active", "restart suspension clears with browser session storage");
  await controls.resume();

  const current = mediaStatus();
  await controls.ignoreCurrent(current);
  assert.equal((await controls.status({ ...current, media: { ...current.media, progress: 80 } })).mode, "ignored", "progress changes do not end current-playback exclusion");
  assert.equal((await controls.status(mediaStatus("Episode two"))).mode, "active", "new media is not silently ignored");
  await controls.resumeCurrent();
  assert.equal((await controls.status(current)).mode, "active");

  const malformed = createScrobbleControls({
    localStorage: createStorage({ [CONTROL_SETTINGS_KEY]: { globallyEnabled: "no", disabledProviders: ["netflix", "netflix", "invalid"], suspendedUntil: -1 } }),
    sessionStorage: createStorage({ [CONTROL_SESSION_KEY]: { suspendedForSession: "yes", ignoredMediaKey: 42 } }),
    now: () => now,
  });
  const settings = await malformed.settings();
  assert.equal(settings.globallyEnabled, true);
  assert.deepEqual(settings.disabledProviders, ["netflix"]);
  assert.equal((await malformed.status(mediaStatus())).mode, "providerDisabled");

  console.log("scrobble controls checks: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
