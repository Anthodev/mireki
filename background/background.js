const store = new MirekiSessions.SessionStore({ extensionId: browser.runtime.id });
const scrobbleControls = MirekiScrobbleControls.createScrobbleControls({
  localStorage: browser.storage.local,
  sessionStorage: browser.storage.session,
});
const EXPIRY_ALARM = "mireki:session-expiry";
const SCROBBLE_RESUME_ALARM = "mireki:scrobble-resume";

async function scheduleExpiry() {
  const when = store.nextExpiry();
  if (when === null) await browser.alarms.clear(EXPIRY_ALARM);
  else await browser.alarms.create(EXPIRY_ALARM, { when });
}
async function scheduleScrobbleResume() {
  const when = await scrobbleControls.nextResume();
  if (when === null) await browser.alarms.clear(SCROBBLE_RESUME_ALARM);
  else await browser.alarms.create(SCROBBLE_RESUME_ALARM, { when });
}

async function processSelection() {
  const status = store.status();
  const controlState = await scrobbleControls.status(status);
  await globalThis.MirekiScrobble?.handle(status, controlState.mode === "active" ? null : controlState.mode);
  await Promise.all([scheduleExpiry(), scheduleScrobbleResume()]);
  return status;
}
async function controlPayload(status = store.status()) {
  const [state, settings] = await Promise.all([
    scrobbleControls.status(status),
    scrobbleControls.settings(),
  ]);
  return {
    ...state,
    globallyEnabled: settings.globallyEnabled,
    providers: MirekiScrobbleControls.PROVIDERS.map(({ id, label }) => ({
      id,
      label,
      enabled: !settings.disabledProviders.includes(id),
    })),
  };
}
async function statusResponse() {
  const status = await processSelection();
  if (status.kind === "media") {
    status.sync = globalThis.MirekiScrobble?.statusFor(status.source) || { state: "idle" };
    const manual = globalThis.MirekiManualMatch;
    const correction = await manual?.get(status).catch(() => null) || null;
    status.manualMatch = correction ? { ...correction, mediaKey: manual.identity(status) } : null;
  }
  status.controls = await controlPayload(status);
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
async function updateControls(message) {
  try {
    if (message.type === "scrobble-controls:set-global") {
      await scrobbleControls.setGlobalEnabled(message.enabled);
    } else if (message.type === "scrobble-controls:set-provider") {
      await scrobbleControls.setProviderEnabled(message.providerId, message.enabled);
    } else if (message.type === "scrobble-controls:pause") {
      await scrobbleControls.pause(message.duration);
    } else if (message.type === "scrobble-controls:resume") {
      await scrobbleControls.resume();
    } else if (message.type === "scrobble-controls:ignore-current") {
      await scrobbleControls.ignoreCurrent(selectedMedia());
    } else if (message.type === "scrobble-controls:resume-current") {
      await scrobbleControls.resumeCurrent();
    }
    const status = await processSelection();
    return { ok: true, controls: await controlPayload(status) };
  } catch (error) {
    return { ok: false, error: error?.message === "No current media" ? "noMedia" : "invalidRequest" };
  }
}

const CONTROL_MESSAGES = new Set([
  "scrobble-controls:set-global",
  "scrobble-controls:set-provider",
  "scrobble-controls:pause",
  "scrobble-controls:resume",
  "scrobble-controls:ignore-current",
  "scrobble-controls:resume-current",
]);


MirekiWebExtension.addMessageListener((message, sender) => {
  if (message?.type === MirekiSessions.OBSERVATION) {
    const accepted = store.ingest(message, sender);
    if (!accepted) return Promise.resolve({ accepted: false });
    return processSelection().then(() => ({ accepted: true }));
  }
  if (message?.type === MirekiSessions.STATUS && sender?.id === browser.runtime.id) return statusResponse();
  if (trustedExtensionPage(sender) && message?.type === "scrobble-controls:get") {
    return controlPayload().then((controls) => ({ ok: true, controls }));
  }
  if (trustedExtensionPage(sender) && CONTROL_MESSAGES.has(message?.type)) return updateControls(message);
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
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === EXPIRY_ALARM) return processSelection().catch(() => {});
  if (alarm?.name === SCROBBLE_RESUME_ALARM) {
    return scrobbleControls.clearExpiredPause().then(processSelection).catch(() => {});
  }
  return undefined;
});
