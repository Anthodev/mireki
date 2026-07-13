const tokenStore = MirekiTokenStore.createTokenStore(browser.storage.local);
const authServices = new Map();
authServices.set("trakt", MirekiTraktAuth.createTraktAuth({
  config: MirekiAuthConfig,
  identity: browser.identity,
  tokenStore,
  fetch: globalThis.fetch.bind(globalThis),
  crypto: globalThis.crypto,
}));
globalThis.MirekiAuthServices = authServices;

function trustedExtensionPage(sender) {
  const url = sender?.url || sender?.tab?.url;
  return sender?.id === browser.runtime.id && url?.startsWith(browser.runtime.getURL(""));
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (!trustedExtensionPage(sender) || !message || typeof message.type !== "string") return undefined;
  if (message.type === "auth:list") return Promise.all([...authServices.values()].map((service) => service.status()));
  if ((message.type === "auth:connect" || message.type === "auth:disconnect") && typeof message.serviceId === "string") {
    const service = authServices.get(message.serviceId);
    if (!service) return Promise.resolve({ ok: false, error: "Unknown service" });
    if (message.type === "auth:disconnect") return (async () => {
      if (service.id === "trakt") await globalThis.MirekiScrobble?.reset();
      try {
        const status = await service.disconnect();
        return { ok: true, status };
      } catch {
        return { ok: false, error: "Authentication failed" };
      } finally {
        if (service.id === "trakt") await browser.storage.local.remove(MirekiScrobbleController.COMPLETED_KEY);
      }
    })();
    return service.connect().then((status) => {
      if (service.id === "trakt") globalThis.MirekiScrobble?.resume();
      return { ok: true, status };
    }, () => ({ ok: false, error: "Authentication failed" }));
  }
  return undefined;
});
