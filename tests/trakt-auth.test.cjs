const assert = require("node:assert/strict");
const { createTraktAuth, normalizeToken } = require("../services/trakt-auth.js");
const config = { oauthBrokerUrl: "https://broker.test/", traktClientId: "client" };
const rawToken = { access_token: "access", refresh_token: "refresh", expires_in: 120, created_at: 1000, token_type: "BEARER", scope: "public", leaked: "discard-me" };
const expectedToken = { access_token: "access", refresh_token: "refresh", expires_in: 120, created_at: 1000, scope: "public", token_type: "bearer" };
assert.deepEqual(normalizeToken(rawToken), expectedToken);
assert.equal(normalizeToken({ ...rawToken, scope: "x".repeat(1025) }), null);

function setup({ initialToken = null, failRevoke = false, now = () => 1000_000 } = {}) {
  let stored = initialToken;
  const requests = [];
  const tokenStore = {
    async get() { return stored; }, async set(_id, value) { stored = value; }, async remove() { stored = null; },
  };
  const auth = createTraktAuth({ config, tokenStore, now, crypto: { getRandomValues(a) { a.fill(1); return a; } },
    identity: { getRedirectURL: () => "https://ext.test/oauth", async launchWebAuthFlow({ url }) { return `https://ext.test/oauth?code=once&state=${new URL(url).searchParams.get("state")}`; } },
    async fetch(url, init) {
      const body = JSON.parse(init.body); requests.push({ url, body });
      if (url.endsWith("/start")) return { ok: true, json: async () => ({ authorizationUrl: `https://trakt.tv/oauth/authorize?state=${body.state}` }) };
      if (url.endsWith("/revoke")) return { ok: !failRevoke, json: async () => failRevoke ? null : ({ ok: true }) };
      return { ok: true, json: async () => rawToken };
    },
  });
  return { auth, requests, stored: () => stored };
}

(async () => {
  const connected = setup();
  assert.equal((await connected.auth.connect()).connected, true);
  assert.deepEqual(connected.stored(), expectedToken, "connect persists allowlisted fields only");

  const fresh = setup({ initialToken: expectedToken, now: () => 1001_000 });
  assert.equal((await fresh.auth.disconnect()).revocationFailed, false);
  assert.deepEqual(fresh.requests.map(({ url }) => url.split("/").pop()), ["revoke"]);
  assert.deepEqual(fresh.requests[0].body, { accessToken: "access" });
  assert.equal(fresh.stored(), null);

  const expired = setup({ initialToken: expectedToken, now: () => 2_000_000 });
  await expired.auth.disconnect();
  assert.deepEqual(expired.requests.map(({ url }) => url.split("/").pop()), ["refresh", "revoke"]);
  assert.deepEqual(expired.stored(), null);

  const failed = setup({ initialToken: expectedToken, failRevoke: true, now: () => 1001_000 });
  const failedStatus = await failed.auth.disconnect();
  assert.equal(failedStatus.revocationFailed, true);
  assert.equal(failedStatus.connected, false);
  assert.equal(failed.stored(), null, "disconnect always removes local token");
  assert.equal(JSON.stringify(failedStatus).includes("access"), false);

  const unavailable = setup();
  const disabled = createTraktAuth({ config: { oauthBrokerUrl: "http://bad", traktClientId: "x" }, identity: {}, tokenStore: { async get() { return null; } }, fetch() {}, crypto: {} });
  await assert.rejects(() => disabled.connect(), /not configured/);
  console.log("Trakt auth checks: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
