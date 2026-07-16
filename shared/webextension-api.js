(function (root) {
  const nativeBrowser = root.browser;
  const api = nativeBrowser || root.chrome;
  if (!api) throw new Error("WebExtension API unavailable");
  if (!nativeBrowser) root.browser = api;

  function addMessageListener(listener) {
    if (nativeBrowser) return api.runtime.onMessage.addListener(listener);
    api.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const response = listener(message, sender);
      if (!response || typeof response.then !== "function") return response;
      response.then(sendResponse, () => sendResponse());
      return true;
    });
  }

  root.MirekiWebExtension = Object.freeze({ addMessageListener });
})(globalThis);
