(function (root, factory) {
  const mediaApi = root.MirekiMedia || (typeof require === "function" ? require("../playback/media-snapshot.js") : null);
  const providerApi = root.MirekiProviderAdapter || null;
  const api = factory(mediaApi, providerApi);
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.MirekiObserver = api;
    api.createMediaObserver({
      document,
      MutationObserver,
      sendMessage: (message) => browser.runtime.sendMessage(message),
    }).start();
  }
})(globalThis, (MirekiMedia, defaultProviderAdapter) => {
  const EVENTS = ["play", "pause", "ended", "durationchange", "seeking", "seeked", "emptied", "loadedmetadata", "timeupdate"];

  function createMediaObserver({
    document,
    navigator = globalThis.navigator,
    MutationObserver,
    sendMessage,
    now = Date.now,
    setInterval = globalThis.setInterval,
    clearInterval = globalThis.clearInterval,
    progressThrottleMs = 1_000,
    heartbeatMs = 10_000,
    providerAdapter = defaultProviderAdapter,
  }) {
    const mediaElements = new Set();
    const listeners = new Map();
    let mutationObserver;
    let heartbeat;
    let lastProgressAt = -Infinity;

    const isMedia = (node) => node?.tagName === "VIDEO" || node?.tagName === "AUDIO";
    const descendants = (node) => node?.querySelectorAll ? node.querySelectorAll("video, audio") : [];
    function visible(element) {
      const rect = element.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      const view = document.defaultView || globalThis;
      if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= view.innerHeight || rect.left >= view.innerWidth) return false;
      for (let current = element; current; current = current.parentElement) {
        const style = view.getComputedStyle?.(current);
        if (style && (style.display === "none" || style.visibility === "hidden"
          || style.visibility === "collapse" || Number(style.opacity) === 0)) return false;
      }
      return true;
    }
    function snapshot() {
      const candidates = [...mediaElements]
        .filter((element) => element.isConnected !== false)
        .map((element) => ({
          element,
          tagName: element.tagName,
          currentTime: element.currentTime,
          duration: element.duration,
          paused: element.paused,
          ended: element.ended,
          visible: visible(element),
          poster: element.getAttribute?.("poster") || null,
          title: element.getAttribute?.("aria-label") || element.getAttribute?.("title") || document.title,
        }));
      const selected = MirekiMedia.selectMedia(candidates);
      const standardMetadata = {
        ...MirekiMedia.extractMediaSessionMetadata(navigator, document.URL),
        language: MirekiMedia.extractLanguage(document, navigator),
      };
      let providerMetadata = null;
      try {
        providerMetadata = providerAdapter?.extractMetadata?.({
          document, navigator, metadata: standardMetadata, mediaElement: selected?.element,
        }) || null;
      } catch {}
      const metadata = providerMetadata ? { ...standardMetadata, ...providerMetadata } : standardMetadata;
      return selected ? MirekiMedia.normalizeMedia(selected, metadata, document.URL) : null;
    }
    function emit() {
      const result = sendMessage({
        type: "media:observation",
        media: snapshot(),
        pageTitle: String(document.title || "").slice(0, 300),
      });
      result?.catch?.(() => {});
    }
    function onEvent(event) {
      if (event.type === "timeupdate") {
        const timestamp = now();
        if (timestamp - lastProgressAt < progressThrottleMs) return;
        lastProgressAt = timestamp;
      }
      emit();
    }
    function add(element) {
      if (!isMedia(element) || mediaElements.has(element)) return false;
      mediaElements.add(element);
      const handler = (event) => onEvent(event);
      listeners.set(element, handler);
      for (const event of EVENTS) element.addEventListener(event, handler);
      return true;
    }
    function remove(element) {
      if (!mediaElements.delete(element)) return false;
      const handler = listeners.get(element);
      for (const event of EVENTS) element.removeEventListener(event, handler);
      listeners.delete(element);
      return true;
    }
    function visit(node, operation) {
      let changed = operation(node);
      for (const element of descendants(node)) changed = operation(element) || changed;
      return changed;
    }
    function start() {
      visit(document, add);
      mutationObserver = new MutationObserver((records) => {
        let changed = false;
        for (const record of records) {
          for (const node of record.removedNodes) changed = visit(node, remove) || changed;
          for (const node of record.addedNodes) changed = visit(node, add) || changed;
          try { changed = providerAdapter?.isMetadataMutation?.(record) || changed; } catch {}
        }
        if (changed) emit();
      });
      mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
      heartbeat = setInterval(() => { if (mediaElements.size) emit(); }, heartbeatMs);
      emit();
      return api;
    }
    function stop() {
      mutationObserver?.disconnect();
      clearInterval(heartbeat);
      for (const element of [...mediaElements]) remove(element);
    }
    const api = { start, stop, snapshot };
    return api;
  }

  return { createMediaObserver };
});
