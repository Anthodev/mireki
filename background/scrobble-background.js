(() => {
  const auth = globalThis.MirekiAuthServices?.get("trakt");
  if (!auth || !MirekiAuthConfig.traktClientId) return;
  const client = MirekiTraktClient.createTraktClient({
    getAccessToken: () => auth.accessToken(),
    clientId: MirekiAuthConfig.traktClientId,
    fetch: globalThis.fetch.bind(globalThis),
  });
  const matcher = MirekiTraktMatcher.createTraktMatcher(client);
  const manualMatches = MirekiManualMatchStore.createManualMatchStore({ storage: browser.storage.local });
  const manualService = MirekiManualMatchService.createManualMatchService(client);
  globalThis.MirekiManualMatch = {
    identity: manualMatches.identity,
    get: manualMatches.get,
    search: manualService.search,
    async set(status, mediaKey, selection) {
      if (!mediaKey || manualMatches.identity(status) !== mediaKey) throw new Error("Stale media");
      const correction = await manualService.resolve(selection);
      return manualMatches.set(status, correction);
    },
    async remove(status, mediaKey) {
      if (!mediaKey || manualMatches.identity(status) !== mediaKey) throw new Error("Stale media");
      return manualMatches.remove(status);
    },
  };
  let controller;
  controller = MirekiScrobbleController.createScrobbleController({
    matcher,
    manualMatches,
    client,
    isConnected: async () => (await auth.status()).connected,
    storage: browser.storage.local,
    onUnauthorized: async () => {
      await auth.disconnect();
      await browser.storage.local.remove(MirekiScrobbleController.COMPLETED_KEY);
    },
  });
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const change = changes[MirekiCompletionThreshold.COMPLETION_THRESHOLD_KEY];
    if (change) controller.setCompletionThreshold(change.newValue);
  });
  globalThis.MirekiScrobble = controller;
})();
