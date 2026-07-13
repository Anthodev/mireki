# Mireki

Build-free Firefox MV3 WebExtension for Firefox 142+. Mireki continuously observes standard HTML video/audio on explicitly supported streaming services and shows best current playback. Connected Trakt accounts receive automatic start/pause scrobbles and one watched completion at 85% when metadata resolves uniquely.

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

Open Firefox Add-ons → Mireki → Preferences. Trakt login starts from this page. Set public `oauthBrokerUrl` and `traktClientId` in `config/auth-config.js`. Never add Trakt client secret. Broker receives only OAuth authorization code/token data. Raw observations stay local; selected media titles, episode coordinates, Trakt IDs, and playback progress are sent directly to Trakt for matching and scrobbling.

Tokens are stored by background code in `browser.storage.local` and never returned to options/content scripts. Firefox extension storage is not encrypted against someone with local profile or OS access. Disconnect asks broker to revoke remote access and always removes local token; options warns if remote revocation fails.

### Bunny OAuth broker contract

Broker must implement `POST /v1/oauth/trakt/start`, `/exchange`, `/refresh`, and `/revoke`. Extension revoke request is JSON `{ "accessToken": "<current valid access token>" }`. Bunny must call Trakt `POST https://api.trakt.tv/oauth/revoke` with `Content-Type: application/json` and body exactly `{ "token": "<access token>", "client_id": "<public client ID>", "client_secret": "<Bunny-only secret>" }`. Bunny must never return or log client secret. Until revoke endpoint exists, disconnect still deletes local token and reports remote revocation failure.

## Verify

```sh
node tests/manifest-permissions.test.cjs && node tests/trakt-client.test.cjs && node tests/trakt-matcher.test.cjs && node tests/scrobble-controller.test.cjs && node tests/trakt-auth.test.cjs && node tests/auth-background.test.cjs && node tests/options-status.test.cjs && node tests/artwork-url.test.cjs && node tests/media-snapshot.test.cjs && node tests/media-observer.test.cjs && node tests/session-store.test.cjs && node tests/background.test.cjs && node tests/popup-state.test.cjs
find auth background config content options playback popup services shared trakt -name '*.js' -print0 | xargs -0 -n1 node --check
node -e "const fs=require('node:fs'); const m=JSON.parse(fs.readFileSync('manifest.json')); for(const p of [m.action.default_popup,...Object.values(m.icons),...m.background.scripts,...m.content_scripts.flatMap(x=>x.js)]) fs.accessSync(p)"
npx --yes web-ext@10.5.0 lint --source-dir .
```

## Permissions and privacy

Mireki requests HTTPS access only for an explicit streaming allowlist: Crunchyroll, Netflix, Prime Video, Paramount+, Animation Digital Network, Max/HBO Max, Disney+, Apple TV+, Hulu, and Peacock, plus background-only Trakt API access. Generic Amazon retail domains, HTTP, file, FTP, Firefox UI, extension pages, PDF viewer, and unrelated websites are excluded. These permissions allow continuous playback observation in background tabs and matching embedded frames without toolbar clicks.

Observer reads only standard media state, bounded Media Session title/artist/album/artwork when exposed, media/page title fallback, and source URL/hostname needed for status. Raw frame/session data stays in extension memory and expires after 30 seconds. For connected accounts, selected title metadata and progress are sent directly to Trakt; no unrelated browsing data is sent. No telemetry or browsing-history persistence exists. Opening popup may load validated HTTPS artwork from its third-party host with no referrer; host can still observe normal network metadata such as IP and user agent. Page values remain untrusted and popup uses `textContent`.

## Architecture and lifecycle

- `playback/media-snapshot.js`: provider-neutral selection plus bounded standard Media Session metadata normalization; media/page title remains title fallback. No 85% completion behavior.
- `content/media-observer.js`: declarative all-frame observer. Media listeners cover playback/seek/duration events; `timeupdate` sends at most once per second. `MutationObserver` tracks only inserted/removed media, including YouTube-style SPA player replacement. Ten-second heartbeat while media exists restores state after MV3 event-page restart.
- `shared/session-store.js` and `background/`: validate sender/message boundaries, retain latest frame states, keep current playing winner sticky against competing playing frames, and route only selected global status through one awaited Trakt listener. Navigation, closed-tab, explicit-empty, and a one-shot background alarm at the earliest 30-second expiry update selection even without another observation.
- `trakt/`: strict API client and automatic matcher. Exact search uses Trakt canonical/original titles, translations, and aliases when indexed. If exact search misses a transliteration such as Kamui/Kamuy, one-edit fuzzy fallback is accepted only when it leaves one canonical candidate. Episodes use explicit season/episode coordinates or Trakt's unique `number_abs` mapping from full episode metadata for absolute provider numbering; cumulative season offsets are never guessed.
- `playback/scrobble-controller.js`: accepts only selected global status; pauses replaced playing winner before starting next source; sends stop once at 85%; persists only acknowledged completion IDs. Deterministic failures use bounded volatile five-minute cooldown keyed by normalized title/artist/album; metadata changes retry immediately, while transient failures retain retry timing.
- `popup/`: renders artwork, playback, and safe Trakt sync status. Closing popup does not stop observation or scrobbling.

Background state is intentionally memory-only. Firefox MV3 background scripts can unload; next active-media heartbeat/event repopulates it within ten seconds. Only normalized OAuth tokens and bounded acknowledged Trakt completion IDs are durable; browsing URLs and raw observations remain volatile. First selected playing frame stays winner while it remains playing; when it pauses, ends, disappears, navigates, or expires, deterministic rank and recency choose replacement. Ads or embedded players can therefore win until provider metadata exists.

## Manual Firefox checks

1. Start supported playback, close popup for at least 15 seconds, reopen it: playback and progress appear.
2. Leave playback running, switch to another tab, open popup: source remains selected.
3. Verify an indexed translated/localized title resolves through Trakt exact search; missing or ambiguous metadata remains unsynced.
4. On a show using absolute numbering, verify `Episode 52` resolves only when Trakt exposes one unique episode with `number_abs: 52`.
5. Play standard `<video>` or `<audio>` on another allowlisted streaming service; playing media beats paused media.
6. Pause all media, close a source tab, and navigate another source tab: stale source disappears.
7. Inspect `about:debugging` background context, terminate/reload it if available, wait up to ten seconds: heartbeat restores status.

## Mozilla sources

- [Declarative content scripts and `all_frames`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts)
- [Content-script permissions and restrictions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts)
- [Firefox MV3 background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)
- [`runtime.onMessage`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage)
- [`tabs.onRemoved`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/onRemoved)
- [`tabs.onUpdated`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/onUpdated)
