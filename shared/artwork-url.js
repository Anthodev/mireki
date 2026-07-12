(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiArtwork = api;
})(globalThis, () => {
  const MAX_ARTWORK_URL_LENGTH = 2048;

  function normalizeArtworkUrl(value, baseUrl) {
    if (typeof value !== "string" || !value || value.length > MAX_ARTWORK_URL_LENGTH || /[\u0000-\u001f\u007f]/.test(value)) return null;
    try {
      const url = baseUrl ? new URL(value, baseUrl) : new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.href.length > MAX_ARTWORK_URL_LENGTH) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  const isValidArtworkUrl = (value) => normalizeArtworkUrl(value) === value;
  return { MAX_ARTWORK_URL_LENGTH, isValidArtworkUrl, normalizeArtworkUrl };
});
