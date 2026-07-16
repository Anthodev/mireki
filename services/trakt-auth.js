(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiTraktAuth = api;
})(globalThis, () => {
  const SERVICE_ID = "trakt";
  const SERVICE_LABEL = "Trakt";
  const MAX_TOKEN_LENGTH = 4096;
  const MAX_SCOPE_LENGTH = 1024;
  const MAX_STATE_LENGTH = 2048;
  const bounded = (value, max = MAX_TOKEN_LENGTH) => typeof value === "string" && value.length > 0 && value.length <= max;
  const httpsUrl = (value) => {
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url : null; } catch { return null; }
  };
  function normalizeToken(value) {
    if (!value || !bounded(value.access_token) || !bounded(value.refresh_token)
      || !Number.isFinite(value.expires_in) || value.expires_in <= 0
      || !Number.isFinite(value.created_at) || value.created_at <= 0
      || typeof value.token_type !== "string" || value.token_type.toLowerCase() !== "bearer"
      || (value.scope !== undefined && !bounded(value.scope, MAX_SCOPE_LENGTH))) return null;
    const token = {
      access_token: value.access_token, refresh_token: value.refresh_token,
      expires_in: value.expires_in, created_at: value.created_at,
    };
    if (value.scope !== undefined) token.scope = value.scope;
    token.token_type = "bearer";
    return token;
  }
  const validToken = (value) => Boolean(normalizeToken(value));
  function publicStatus(token, available, revocationFailed = false) {
    return { id: SERVICE_ID, label: SERVICE_LABEL, available, connected: Boolean(token), expiresAt: token ? (token.created_at + token.expires_in) * 1000 : null, revocationFailed };
  }
  function randomState(crypto) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  function createTraktAuth({ config, identity, tokenStore, fetch, crypto, now = Date.now }) {
    const broker = httpsUrl(config.oauthBrokerUrl);
    const available = Boolean(broker && bounded(config.traktClientId, 300));
    const endpoint = (path) => new URL(path, `${broker.href.replace(/\/$/, "")}/`).href;
    async function post(path, body) {
      const response = await fetch(endpoint(path), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "omit", referrerPolicy: "no-referrer",
      });
      const value = await response.json().catch(() => null);
      if (!response.ok || !value) throw new Error("OAuth broker request failed");
      return value;
    }
    async function persistResponse(value, error) {
      const token = normalizeToken(value);
      if (!token) throw new Error(error);
      await tokenStore.set(SERVICE_ID, token);
      return token;
    }
    async function refresh(token) {
      return persistResponse(await post("v1/oauth/trakt/refresh", { refreshToken: token.refresh_token }), "Invalid refreshed token response");
    }
    const needsRefresh = (token) => (token.created_at + token.expires_in) * 1000 - now() <= 60_000;
    async function status() { return publicStatus(await tokenStore.get(SERVICE_ID), available); }
    async function connect() {
      if (!available) throw new Error("Trakt OAuth is not configured");
      const redirectUri = identity.getRedirectURL("oauth");
      const state = randomState(crypto);
      const start = await post("v1/oauth/trakt/start", { clientId: config.traktClientId, redirectUri, state });
      const authorizationUrl = httpsUrl(start.authorizationUrl);
      const authorizationState = authorizationUrl?.searchParams.get("state");
      if (!authorizationUrl || authorizationUrl.origin !== "https://trakt.tv" || authorizationUrl.pathname !== "/oauth/authorize"
        || !bounded(authorizationState, MAX_STATE_LENGTH)) throw new Error("Invalid authorization URL");
      const redirected = new URL(await identity.launchWebAuthFlow({ url: authorizationUrl.href, interactive: true }));
      const expected = new URL(redirectUri);
      if (redirected.origin !== expected.origin || redirected.pathname !== expected.pathname
        || redirected.searchParams.get("state") !== authorizationState || !bounded(redirected.searchParams.get("code"), 512)) throw new Error("Invalid OAuth redirect");
      const token = await persistResponse(await post("v1/oauth/trakt/exchange", {
        code: redirected.searchParams.get("code"), redirectUri, state: authorizationState,
      }), "Invalid OAuth token response");
      return publicStatus(token, true);
    }
    async function disconnect() {
      let revocationFailed = false;
      try {
        let token = await tokenStore.get(SERVICE_ID);
        if (token) {
          if (!validToken(token)) throw new Error("Invalid stored token");
          if (needsRefresh(token)) token = await refresh(token);
          await post("v1/oauth/trakt/revoke", { accessToken: token.access_token });
        }
      } catch { revocationFailed = true; }
      finally { await tokenStore.remove(SERVICE_ID); }
      return publicStatus(null, available, revocationFailed);
    }
    async function accessToken() {
      let token = await tokenStore.get(SERVICE_ID);
      if (!token) return null;
      if (!validToken(token)) throw new Error("Invalid stored token");
      if (needsRefresh(token)) token = await refresh(token);
      return token.access_token;
    }
    return { id: SERVICE_ID, label: SERVICE_LABEL, status, connect, disconnect, accessToken };
  }
  return { createTraktAuth, publicStatus, validToken, normalizeToken };
});
