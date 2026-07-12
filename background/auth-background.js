const tokenStore = MirekiTokenStore.createTokenStore(browser.storage.local);
const authServices = new Map();
authServices.set("trakt", MirekiTraktAuth.createTraktAuth({
  config: MirekiAuthConfig,
  identity: browser.identity,
  tokenStore,
  fetch: globalThis.fetch.bind(globalThis),
  crypto: globalThis.crypto,
}));

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
    const operation = message.type === "auth:connect" ? service.connect : service.disconnect;
    return operation().then((status) => ({ ok: true, status }), () => ({ ok: false, error: "Authentication failed" }));
  }
  return undefined;
});
