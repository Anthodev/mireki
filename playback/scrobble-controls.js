(function (root, factory) {
  const sessionApi = root.MirekiSessions
    || (typeof require === "function" ? require("../shared/session-store.js") : null);
  const api = factory(sessionApi);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiScrobbleControls = api;
})(globalThis, (MirekiSessions) => {
  const CONTROL_SETTINGS_KEY = "scrobble.controls.v1";
  const CONTROL_SESSION_KEY = "scrobble.controls.session.v1";
  const PAUSE_DURATIONS = Object.freeze({ "15m": 15 * 60_000, "1h": 60 * 60_000 });
  const PROVIDERS = MirekiSessions.PROVIDERS;
  const providerIds = new Set(PROVIDERS.map(({ id }) => id));

  function normalizeSettings(value) {
    const disabledProviders = Array.isArray(value?.disabledProviders)
      ? [...new Set(value.disabledProviders.filter((id) => providerIds.has(id)))]
      : [];
    return {
      globallyEnabled: typeof value?.globallyEnabled === "boolean" ? value.globallyEnabled : true,
      disabledProviders,
      suspendedUntil: Number.isFinite(value?.suspendedUntil) && value.suspendedUntil > 0 ? value.suspendedUntil : null,
    };
  }

  function normalizeSession(value) {
    return {
      suspendedForSession: value?.suspendedForSession === true,
      ignoredMediaKey: typeof value?.ignoredMediaKey === "string" && value.ignoredMediaKey.length <= 2_500
        ? value.ignoredMediaKey : null,
    };
  }

  function providerFor(source) {
    const hostname = typeof source?.hostname === "string" ? source.hostname.toLocaleLowerCase() : "";
    return PROVIDERS.find(({ host }) => hostname === host || hostname.endsWith(`.${host}`)) || null;
  }

  const normalizedIdentity = (values) => values
    .map((value) => value == null ? "" : String(value).normalize("NFKC").trim().toLocaleLowerCase())
    .join("\u0000");

  function mediaIdentity(status) {
    if (status?.kind !== "media") return null;
    return normalizedIdentity([
      providerFor(status.source)?.id,
      status.source?.tabId,
      status.source?.frameId,
      status.media?.title,
      status.media?.artist,
      status.media?.album,
      status.media?.language,
      status.media?.episodeNumber,
      status.source?.pageTitle,
    ]);
  }

  function createScrobbleControls({ localStorage, sessionStorage, now = Date.now }) {
    let settingsPromise;
    let sessionPromise;

    async function readSettings() {
      if (!settingsPromise) settingsPromise = localStorage.get(CONTROL_SETTINGS_KEY)
        .then((stored) => normalizeSettings(stored?.[CONTROL_SETTINGS_KEY]), () => normalizeSettings());
      return settingsPromise;
    }

    async function readSession() {
      if (!sessionPromise) sessionPromise = sessionStorage.get(CONTROL_SESSION_KEY)
        .then((stored) => normalizeSession(stored?.[CONTROL_SESSION_KEY]), () => normalizeSession());
      return sessionPromise;
    }

    async function writeSettings(value) {
      const normalized = normalizeSettings(value);
      await localStorage.set({ [CONTROL_SETTINGS_KEY]: normalized });
      settingsPromise = Promise.resolve(normalized);
      return normalized;
    }

    async function writeSession(value) {
      const normalized = normalizeSession(value);
      await sessionStorage.set({ [CONTROL_SESSION_KEY]: normalized });
      sessionPromise = Promise.resolve(normalized);
      return normalized;
    }

    async function settings() {
      const value = await readSettings();
      return { ...value, disabledProviders: [...value.disabledProviders] };
    }

    async function setGlobalEnabled(enabled) {
      if (typeof enabled !== "boolean") throw new TypeError("Invalid global setting");
      return writeSettings({ ...await readSettings(), globallyEnabled: enabled });
    }

    async function setProviderEnabled(providerId, enabled) {
      if (!providerIds.has(providerId)) throw new TypeError("Invalid provider");
      if (typeof enabled !== "boolean") throw new TypeError("Invalid provider setting");
      const current = await readSettings();
      const disabled = new Set(current.disabledProviders);
      if (enabled) disabled.delete(providerId);
      else disabled.add(providerId);
      return writeSettings({ ...current, disabledProviders: [...disabled] });
    }

    async function pause(duration) {
      if (duration === "restart") {
        const current = await readSettings();
        await writeSettings({ ...current, suspendedUntil: null });
        await writeSession({ ...await readSession(), suspendedForSession: true });
        return;
      }
      const milliseconds = PAUSE_DURATIONS[duration];
      if (!milliseconds) throw new TypeError("Invalid pause duration");
      await writeSession({ ...await readSession(), suspendedForSession: false });
      await writeSettings({ ...await readSettings(), suspendedUntil: now() + milliseconds });
    }

    async function resume() {
      await writeSettings({ ...await readSettings(), suspendedUntil: null });
      await writeSession({ ...await readSession(), suspendedForSession: false });
    }

    async function clearExpiredPause() {
      const current = await readSettings();
      if (current.suspendedUntil !== null && current.suspendedUntil <= now()) {
        await writeSettings({ ...current, suspendedUntil: null });
      }
    }

    async function ignoreCurrent(status) {
      const ignoredMediaKey = mediaIdentity(status);
      if (!ignoredMediaKey) throw new TypeError("No current media");
      await writeSession({ ...await readSession(), ignoredMediaKey });
    }

    async function resumeCurrent() {
      await writeSession({ ...await readSession(), ignoredMediaKey: null });
    }

    async function status(currentStatus) {
      const [currentSettings, currentSession] = await Promise.all([readSettings(), readSession()]);
      const provider = providerFor(currentStatus?.source);
      const base = { providerId: provider?.id || null, providerLabel: provider?.label || null };
      if (!currentSettings.globallyEnabled) return { mode: "disabled", ...base };
      if (currentSession.suspendedForSession) return { mode: "paused", ...base, resumeAt: null };
      if (currentSettings.suspendedUntil !== null && currentSettings.suspendedUntil > now()) {
        return { mode: "paused", ...base, resumeAt: currentSettings.suspendedUntil };
      }
      if (provider && currentSettings.disabledProviders.includes(provider.id)) return { mode: "providerDisabled", ...base };
      if (currentSession.ignoredMediaKey && currentSession.ignoredMediaKey === mediaIdentity(currentStatus)) {
        return { mode: "ignored", ...base };
      }
      return { mode: "active", ...base };
    }

    function nextResume() {
      return readSettings().then((value) => value.suspendedUntil !== null && value.suspendedUntil > now()
        ? value.suspendedUntil : null);
    }

    return {
      settings,
      status,
      setGlobalEnabled,
      setProviderEnabled,
      pause,
      resume,
      clearExpiredPause,
      ignoreCurrent,
      resumeCurrent,
      nextResume,
    };
  }

  return {
    CONTROL_SETTINGS_KEY,
    CONTROL_SESSION_KEY,
    PAUSE_DURATIONS,
    PROVIDERS,
    createScrobbleControls,
    mediaIdentity,
    normalizeSettings,
    providerFor,
  };
});
