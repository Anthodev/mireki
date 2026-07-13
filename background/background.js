const store = new MirekiSessions.SessionStore({ extensionId: browser.runtime.id });
const EXPIRY_ALARM = "mireki:session-expiry";

async function scheduleExpiry() {
  const when = store.nextExpiry();
  if (when === null) await browser.alarms.clear(EXPIRY_ALARM);
  else await browser.alarms.create(EXPIRY_ALARM, { when });
}

async function processSelection() {
  const status = store.status();
  await globalThis.MirekiScrobble?.handle(status);
  await scheduleExpiry();
  return status;
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === MirekiSessions.OBSERVATION) {
    const accepted = store.ingest(message, sender);
    if (!accepted) return Promise.resolve({ accepted: false });
    return processSelection().then(() => ({ accepted: true }));
  }
  if (message?.type === MirekiSessions.STATUS && sender?.id === browser.runtime.id) {
    return processSelection().then((status) => {
      if (status.kind === "media") status.sync = globalThis.MirekiScrobble?.statusFor(status.source) || { state: "idle" };
      return status;
    });
  }
  return undefined;
});

function removeTab(tabId) {
  store.removeTab(tabId);
  return processSelection().catch(() => {});
}
browser.tabs.onRemoved.addListener(removeTab);
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading" || changeInfo.url) return removeTab(tabId);
  return undefined;
});
browser.alarms.onAlarm.addListener((alarm) => alarm?.name === EXPIRY_ALARM ? processSelection().catch(() => {}) : undefined);
