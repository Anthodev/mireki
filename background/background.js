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
async function statusResponse() {
  const status = await processSelection();
  if (status.kind === "media") {
    status.sync = globalThis.MirekiScrobble?.statusFor(status.source) || { state: "idle" };
    const manual = globalThis.MirekiManualMatch;
    const correction = await manual?.get(status).catch(() => null) || null;
    status.manualMatch = correction ? { ...correction, mediaKey: manual.identity(status) } : null;
  }
  return status;
}

function trustedExtensionPage(sender) {
  const url = sender?.url || sender?.tab?.url;
  return sender?.id === browser.runtime.id && url?.startsWith(browser.runtime.getURL(""));
}

function manualFailure(error) {
  return {
    ok: false,
    error: error?.status === 401 ? "notConnected"
      : error?.message === "Stale media" ? "staleMedia" : "requestFailed",
  };
}

function selectedMedia() {
  const status = store.status();
  return status.kind === "media" ? status : null;
}


MirekiWebExtension.addMessageListener((message, sender) => {
  if (message?.type === MirekiSessions.OBSERVATION) {
    const accepted = store.ingest(message, sender);
    if (!accepted) return Promise.resolve({ accepted: false });
    return processSelection().then(() => ({ accepted: true }));
  }
  if (message?.type === MirekiSessions.STATUS && sender?.id === browser.runtime.id) return statusResponse();
  if (trustedExtensionPage(sender) && message?.type === "manual-match:search") {
    const status = selectedMedia();
    const manual = globalThis.MirekiManualMatch;
    if (!status || !manual) return Promise.resolve({ ok: false, error: status ? "notAvailable" : "noMedia" });
    const mediaKey = manual.identity(status);
    return manual.search(message.query).then(
      (results) => ({ ok: true, mediaKey, results }),
      manualFailure,
    );
  }
  if (trustedExtensionPage(sender) && message?.type === "manual-match:set") {
    const status = selectedMedia();
    const manual = globalThis.MirekiManualMatch;
    if (!status || !manual) return Promise.resolve({ ok: false, error: status ? "notAvailable" : "noMedia" });
    return manual.set(status, message.mediaKey, message.selection).then(async (correction) => {
      globalThis.MirekiScrobble?.invalidateMatch();
      await processSelection();
      return { ok: true, correction };
    }, manualFailure);
  }
  if (trustedExtensionPage(sender) && message?.type === "manual-match:remove") {
    const status = selectedMedia();
    const manual = globalThis.MirekiManualMatch;
    if (!status || !manual) return Promise.resolve({ ok: false, error: status ? "notAvailable" : "noMedia" });
    return manual.remove(status, message.mediaKey).then(async (removed) => {
      globalThis.MirekiScrobble?.invalidateMatch();
      await processSelection();
      return { ok: true, removed };
    }, manualFailure);
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
