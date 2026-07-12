# Mireki

Build-free Firefox MV3 WebExtension for Firefox 142+. Mireki continuously observes standard HTML video/audio on explicitly supported streaming services and shows best current playback. Trakt matching and scrobbling are not implemented.

## Run in Firefox

1. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on…**.
2. Select `manifest.json` and accept access to supported streaming services.
3. Pin Mireki to toolbar.
4. Open media on a supported streaming service; popup reports playing media even when source tab is not active.

Or:

```sh
npx --yes web-ext@10.5.0 run --source-dir .
```

## Account connection

Open Firefox Add-ons → Mireki → Preferences. Trakt login starts from this page. Set public `oauthBrokerUrl` and `traktClientId` in `config/auth-config.js`. Never add Trakt client secret. Broker receives only OAuth authorization code/token data; media observations stay local and never go to broker.

Tokens are stored by background code in `browser.storage.local` and never returned to options/content scripts. Firefox extension storage is not encrypted against someone with local profile or OS access. Disconnect asks broker to revoke remote access and always removes local token; options warns if remote revocation fails.

### Bunny OAuth broker contract

Broker must implement `POST /v1/oauth/trakt/start`, `/exchange`, `/refresh`, and `/revoke`. Extension revoke request is JSON `{ "accessToken": "<current valid access token>" }`. Bunny must call Trakt `POST https://api.trakt.tv/oauth/revoke` with `Content-Type: application/json` and body exactly `{ "token": "<access token>", "client_id": "<public client ID>", "client_secret": "<Bunny-only secret>" }`. Bunny must never return or log client secret. Until revoke endpoint exists, disconnect still deletes local token and reports remote revocation failure.

## Verify

```sh
node tests/manifest-permissions.test.cjs && node tests/trakt-auth.test.cjs && node tests/auth-background.test.cjs && node tests/options-status.test.cjs && node tests/artwork-url.test.cjs && node tests/media-snapshot.test.cjs && node tests/media-observer.test.cjs && node tests/session-store.test.cjs && node tests/background.test.cjs && node tests/popup-state.test.cjs
find auth background config content options playback popup services shared -name '*.js' -print0 | xargs -0 -n1 node --check
node -e "const fs=require('node:fs'); const m=JSON.parse(fs.readFileSync('manifest.json')); for(const p of [m.action.default_popup,...Object.values(m.icons),...m.background.scripts,...m.content_scripts.flatMap(x=>x.js)]) fs.accessSync(p)"
npx --yes web-ext@10.5.0 lint --source-dir .
```

## Permissions and privacy

Mireki requests HTTPS access only for an explicit streaming allowlist: Crunchyroll, Netflix, Prime Video, Paramount+, Animation Digital Network, Max/HBO Max, Disney+, YouTube, Apple TV+, Hulu, and Peacock. Generic Amazon retail domains, HTTP, file, FTP, Firefox UI, extension pages, PDF viewer, and unrelated websites are excluded. These permissions allow continuous playback observation in background tabs and matching embedded frames without toolbar clicks.

Observer reads only standard media state, bounded Media Session title/artist/album/artwork when exposed, media/page title fallback, and source URL/hostname needed for status. Data stays in extension memory, expires after 30 seconds without heartbeat, and is never sent externally. No telemetry or browsing-history persistence exists. Opening popup may load validated HTTPS artwork from its third-party host with no referrer; host can still observe normal network metadata such as IP and user agent. Page values remain untrusted and popup uses `textContent`.

## Architecture and lifecycle

- `playback/media-snapshot.js`: provider-neutral selection plus bounded standard Media Session metadata normalization; media/page title remains title fallback. No 85% completion behavior.
- `content/media-observer.js`: declarative all-frame observer. Media listeners cover playback/seek/duration events; `timeupdate` sends at most once per second. `MutationObserver` tracks only inserted/removed media, including YouTube-style SPA player replacement. Ten-second heartbeat while media exists restores state after MV3 event-page restart.
- `shared/session-store.js` and `background/`: validate sender/message boundaries, retain latest frame states, prefer playing media then latest paused media, and clear navigation, closed-tab, explicit-empty, or 30-second stale state.
- `popup/`: renders a flat artwork hero and queries global background status each second; shows Media Session artist when available, otherwise source hostname, without rendering page-title duplicates. Closing popup does not stop observation.

Background state is intentionally memory-only. Firefox MV3 background scripts can unload; next active-media heartbeat/event repopulates it within ten seconds. Durable storage would retain browsing data and is unnecessary before real scrobble deduplication exists. Simultaneous playing frames resolve by latest update, then tab/frame ID; ads or embedded players can therefore win until provider metadata exists.

## Manual Firefox checks

1. Start YouTube playback, close popup for at least 15 seconds, reopen it: playback and progress appear.
2. Leave YouTube playing, switch to another tab, open popup: YouTube remains selected.
3. Navigate within YouTube without full reload and start next video: replacement title/progress appear. If Firefox exposes page Media Session metadata to content scripts, verify channel appears below title; otherwise hostname appears.
4. Play standard `<video>` or `<audio>` on another allowlisted streaming service; playing media beats paused media.
5. Pause all media, close a source tab, and navigate another source tab: stale source disappears.
6. Inspect `about:debugging` background context, terminate/reload it if available, wait up to ten seconds: heartbeat restores status.

## Mozilla sources

- [Declarative content scripts and `all_frames`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts)
- [Content-script permissions and restrictions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts)
- [Firefox MV3 background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)
- [`runtime.onMessage`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage)
- [`tabs.onRemoved`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/onRemoved)
- [`tabs.onUpdated`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/onUpdated)
