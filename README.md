<p align="center">
  <img src="icons/mireki.svg" width="96" height="96" alt="Mireki logo">
</p>

<h1 align="center">Mireki</h1>

<p align="center"><strong>Keep your Trakt viewing history in sync while you watch.</strong></p>

<p align="center">
  <a href="https://addons.mozilla.org/en-US/firefox/addon/mireki/"><img src="https://img.shields.io/badge/Get_for_Firefox-FF7139?logo=firefoxbrowser&amp;logoColor=white" alt="Download Mireki for Firefox"></a>
  <a href="https://chromewebstore.google.com/detail/mireki/glfbpjflkadibmbpcbdiikodgjlaocgh"><img src="https://img.shields.io/badge/Get_for_Chrome-4285F4?logo=googlechrome&amp;logoColor=white" alt="Download Mireki for Chrome"></a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/mireki/"><img src="https://img.shields.io/amo/v/mireki?label=Firefox&amp;logo=firefoxbrowser" alt="Latest stable Firefox version"></a>
  <a href="https://chromewebstore.google.com/detail/mireki/glfbpjflkadibmbpcbdiikodgjlaocgh"><img src="https://img.shields.io/chrome-web-store/v/glfbpjflkadibmbpcbdiikodgjlaocgh?label=Chrome&amp;logo=googlechrome" alt="Latest stable Chrome version"></a>
  <a href="https://github.com/Anthodev/mireki/actions/workflows/tests.yml"><img src="https://github.com/Anthodev/mireki/actions/workflows/tests.yml/badge.svg?branch=develop" alt="Tests"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Anthodev/mireki" alt="License"></a>
</p>

Mireki is a privacy-conscious Firefox extension that follows playback across supported streaming services and automatically reports it to Trakt. It keeps working when the popup is closed, when the source tab is in the background, and when a site replaces its player during navigation.

A Trakt account is optional: without one, Mireki still provides a simple global view of what is currently playing across your open tabs.

## Highlights

- **Continuous playback detection** — observes supported streaming tabs without requiring a toolbar click.
- **Automatic Trakt scrobbling** — starts, pauses, and completes viewing history automatically.
- **Configurable completion threshold** — marks an item watched at a local 80–100% threshold that defaults to 90%.
- **Cautious matching** — supports localized titles, aliases, common episode formats, and absolute anime numbering.
- **Manual match correction** — search Trakt from the popup, choose an exact movie or series episode, and reuse that local correction for the same media.
- **Privacy and scrobbling controls** — pause for 15 minutes, one hour, or until browser restart; ignore the current playback; or disable scrobbling globally or per provider.
- **One global playback status** — keeps the current playing source stable when several tabs or embedded players are active.
- **Background resilience** — recovers observation after Firefox unloads and restarts the extension background.
- **No telemetry** — Mireki does not maintain analytics or collect unrelated browsing history.

## Supported streaming services

Mireki can observe standard media playback on:

- Crunchyroll
- Netflix
- Prime Video

Provider support depends on metadata exposed by each website and by Firefox. Netflix and Prime Video include dedicated, player-scoped fallbacks for series and episode labels when standard metadata is insufficient. Crunchyroll uses the provider-neutral media observer.

## Trakt scrobbling

Connect Trakt from **Firefox Add-ons → Mireki → Preferences**. Once connected, Mireki resolves the selected media and sends meaningful playback transitions rather than an update every second.

> **Best-effort scrobbling:** Streaming services, players, and exposed metadata change over time. Mireki cannot guarantee detection, matching, or scrobbling for every movie, series, episode, language, or provider. When information is missing or uncertain, it prefers not to scrobble rather than report the wrong media.

Mireki can resolve an episode from a unique canonical or translated title within the matched series, using the within-season episode number as an additional hint when a service exposes it. It deliberately leaves media as **Unmatched**, **Ambiguous**, or **Episode unknown** when metadata is insufficient, and never silently invents a season or chooses between multiple candidates.

When automatic matching is insufficient or wrong, **Find on Trakt** opens a focused correction view from the current playback card. Movie selections are validated against Trakt; series selections require explicit season and episode coordinates. Mireki stores the confirmed mapping locally for the exact normalized provider media and lets the user remove it to restore automatic matching.
Contextual controls in the popup can ignore only the current playback or pause all scrobbling for 15 minutes, one hour, or until the browser restarts. Persistent global and per-provider switches live in **Preferences**, where a timed pause can also be resumed immediately.

## Privacy and permissions

Continuous playback detection requires access to the supported streaming domains listed above. Trakt connection and scrobbling use only the configured Mireki OAuth broker and `api.trakt.tv`. Mireki does not request access to unrelated websites, generic Amazon retail pages, HTTP, local files, or FTP.

Raw tab and frame observations remain local and expire quickly. When Trakt is connected, only the selected title or episode metadata, Trakt identifiers, and playback progress needed for matching and scrobbling are sent to Trakt. OAuth tokens stay in browser extension storage and are never exposed to streaming pages, the popup, or logs.
Disabling or pausing scrobbling prevents matching requests and playback updates from being sent to Trakt. Mireki continues minimal local detection so the popup can show the current playback and let you resume; an ignored playback is held only in memory for the current browser session and is cleared when its media identity changes.

Disconnecting removes local credentials and Mireki's local completion state, while also attempting to revoke remote Trakt access. Browser extension storage is controlled by the extension but is not encrypted against someone with access to the local browser profile or operating system account.

## Install from GitHub releases

Firefox users can download the Mozilla-signed `.xpi` file from the matching [GitHub release](https://github.com/Anthodev/mireki/releases) and open it with Firefox.

Releases also include browser-specific ZIP archives. The Firefox ZIP supports temporary loading through `about:debugging`; permanent Firefox installation requires the Mozilla-signed XPI. The Chrome ZIP supports **Load unpacked** developer mode after extraction and is not a Chrome Web Store package.

## Development and browser debugging

Mireki uses native JavaScript and has no runtime dependencies. Node.js 24 or newer generates isolated browser targets:

```sh
node tools/build-extension.cjs
```

Or generate one target with the optional `just` command runner:

```sh
just build-firefox
just build-chrome
just build-firefox-zip
just build-chrome-zip
```

This creates ignored `build/firefox` and `build/chrome` directories. Regenerate the target after source changes; `web-ext` then reloads the updated output.

### Firefox

Run a temporary Firefox profile:

```sh
npx --yes web-ext@10.5.0 run --source-dir build/firefox --devtools
```

For manual loading, open `about:debugging`, select **This Firefox**, choose **Load Temporary Add-on…**, and select `build/firefox/manifest.json`. Firefox removes temporary extensions when the browser closes.

### Chrome

Run Chrome or Chromium:

```sh
npx --yes web-ext@10.5.0 run --target chromium --source-dir build/chrome
```

Use `--chromium-binary google-chrome` when automatic browser discovery does not select the intended executable. For manual loading, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `build/chrome`.

### Run project checks

```sh
node --test
node tools/build-extension.cjs
npx --yes web-ext@10.5.0 lint --source-dir build/firefox
```

## License

Mireki is available under the [MIT License](LICENSE).
