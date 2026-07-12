const store = new MirekiSessions.SessionStore({ extensionId: browser.runtime.id });

browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === MirekiSessions.OBSERVATION) {
    return Promise.resolve({ accepted: store.ingest(message, sender) });
  }
  if (message?.type === MirekiSessions.STATUS && sender?.id === browser.runtime.id) {
    return Promise.resolve(store.status());
  }
  return undefined;
});

browser.tabs.onRemoved.addListener((tabId) => store.removeTab(tabId));
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading" || changeInfo.url) store.removeTab(tabId);
});
