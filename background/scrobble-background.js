(() => {
  const auth = globalThis.MirekiAuthServices?.get("trakt");
  if (!auth || !MirekiAuthConfig.traktClientId) return;
  const client = MirekiTraktClient.createTraktClient({
    getAccessToken: () => auth.accessToken(),
    clientId: MirekiAuthConfig.traktClientId,
    fetch: globalThis.fetch.bind(globalThis),
  });
  const matcher = MirekiTraktMatcher.createTraktMatcher(client);
  let controller;
  controller = MirekiScrobbleController.createScrobbleController({
    matcher,
    client,
    isConnected: async () => (await auth.status()).connected,
    storage: browser.storage.local,
    onUnauthorized: async () => {
      await auth.disconnect();
      await browser.storage.local.remove(MirekiScrobbleController.COMPLETED_KEY);
    },
  });
  browser.storage.local.onChanged.addListener((changes) => {
    const change = changes[MirekiCompletionThreshold.COMPLETION_THRESHOLD_KEY];
    if (change) controller.setCompletionThreshold(change.newValue);
  });
  globalThis.MirekiScrobble = controller;
})();
