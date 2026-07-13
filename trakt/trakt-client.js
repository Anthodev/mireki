(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiTraktClient = api;
})(globalThis, () => {
  const API_URL = "https://api.trakt.tv";
  class TraktApiError extends Error {
    constructor(status, retryAfter = 0) {
      super("Trakt API request failed");
      this.name = "TraktApiError";
      this.status = status;
      this.retryAfter = retryAfter;
    }
  }
  const integer = (value) => Number.isInteger(value) && value > 0;
  const progressValue = (value) => Number.isFinite(value) && value >= 0 && value <= 100;
  function createTraktClient({ getAccessToken, clientId, fetch, now = Date.now }) {
    if (typeof clientId !== "string" || !clientId || clientId.length > 300) throw new Error("Invalid Trakt client ID");
    async function request(path, { method = "GET", body, duplicateStop = false } = {}) {
      const token = await getAccessToken();
      if (!token) throw new TraktApiError(401);
      const response = await fetch(`${API_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "trakt-api-key": clientId,
          "trakt-api-version": "2",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      const value = await response.json().catch(() => null);
      if (duplicateStop && response.status === 409) return { action: "scrobble", duplicate: true };
      if (!response.ok || value === null) {
        const seconds = Number(response.headers?.get?.("Retry-After"));
        throw new TraktApiError(response.status, Number.isFinite(seconds) && seconds > 0 ? now() + seconds * 1000 : 0);
      }
      return value;
    }
    async function searchExact(type, query) {
      if (!new Set(["movie", "show"]).has(type) || typeof query !== "string" || !query.trim() || query.length > 300) return [];
      const path = `/search/${type}/exact?query=${encodeURIComponent(query.trim())}&limit=10&extended=full`;
      const value = await request(path);
      return Array.isArray(value) ? value.slice(0, 10) : [];
    }
    async function searchShows(query) {
      if (typeof query !== "string" || !query.trim() || query.length > 300) return [];
      const value = await request(`/search/show?query=${encodeURIComponent(query.trim())}&limit=10&extended=full`);
      return Array.isArray(value) ? value.slice(0, 10) : [];
    }
    async function episode(showId, season, number) {
      if (!integer(showId) || !Number.isInteger(season) || season < 0 || !Number.isInteger(number) || number < 0) throw new Error("Invalid episode identity");
      const value = await request(`/shows/${showId}/seasons/${season}/episodes/${number}`);
      if (value?.season !== season || value?.number !== number) throw new TraktApiError(502);
      return value;
    }
    async function seasons(showId) {
      if (!integer(showId)) throw new Error("Invalid show identity");
      const value = await request(`/shows/${showId}/seasons?extended=episodes,full`);
      return Array.isArray(value) ? value.slice(0, 200) : [];
    }
    async function scrobble(action, item, progress) {
      if (!new Set(["start", "pause", "stop"]).has(action) || !progressValue(progress)
        || !item || !new Set(["movie", "episode"]).has(item.type) || !integer(item.traktId)) throw new Error("Invalid scrobble");
      const value = await request(`/scrobble/${action}`, {
        method: "POST",
        body: { [item.type]: { ids: { trakt: item.traktId } }, progress },
        duplicateStop: action === "stop",
      });
      const expected = action === "stop" ? "scrobble" : action;
      if (value.action !== expected) throw new TraktApiError(502);
      return value;
    }
    return { searchExact, searchShows, episode, seasons, scrobble };
  }
  return { API_URL, TraktApiError, createTraktClient };
});
