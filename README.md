<p align="center">
  <img src="icons/mireki.svg" width="96" height="96" alt="Mireki logo">
</p>

<h1 align="center">Mireki</h1>

<p align="center"><strong>Keep your Trakt viewing history in sync while you watch.</strong></p>

<p align="center">
  <a href="https://github.com/Anthodev/mireki/actions/workflows/tests.yml"><img src="https://github.com/Anthodev/mireki/actions/workflows/tests.yml/badge.svg?branch=develop" alt="Tests"></a>
</p>

Mireki is a privacy-conscious Firefox extension that follows playback across supported streaming services and automatically reports it to Trakt. It keeps working when the popup is closed, when the source tab is in the background, and when a site replaces its player during navigation.

A Trakt account is optional: without one, Mireki still provides a simple global view of what is currently playing across your open tabs.

## Highlights

- **Continuous playback detection** — observes supported streaming tabs without requiring a toolbar click.
- **Automatic Trakt scrobbling** — starts, pauses, and completes viewing history automatically.
- **85% completion threshold** — marks an item watched only after Mireki reaches its project completion threshold.
- **Cautious matching** — supports localized titles, aliases, common episode formats, and absolute anime numbering without guessing ambiguous results.
- **One global playback status** — keeps the current playing source stable when several tabs or embedded players are active.
- **Background resilience** — recovers observation after Firefox unloads and restarts the extension background.
- **No telemetry** — Mireki does not maintain analytics or collect unrelated browsing history.

## Supported streaming services

Mireki can observe standard media playback on:

- Animation Digital Network
- Apple TV+
- Crunchyroll
- Disney+
- HBO Max
- Hulu
- Max
- Netflix
- Paramount+
- Peacock
- Prime Video

Provider support depends on metadata exposed by each website and by Firefox. Crunchyroll is the primary development target; other services use the same provider-neutral media observer and may need additional real-world validation.

## Trakt scrobbling

Connect Trakt from **Firefox Add-ons → Mireki → Preferences**. Once connected, Mireki resolves the selected media and sends meaningful playback transitions rather than an update every second.

Mireki deliberately leaves media as **Unmatched**, **Ambiguous**, or **Episode unknown** when metadata is insufficient. It never silently invents a season or chooses between multiple candidates.

## Privacy and permissions

Continuous playback detection requires access to the supported streaming domains listed above. Mireki does not request access to unrelated websites, generic Amazon retail pages, HTTP, local files, or FTP.

Raw tab and frame observations remain local and expire quickly. When Trakt is connected, only the selected title or episode metadata, Trakt identifiers, and playback progress needed for matching and scrobbling are sent to Trakt. OAuth tokens stay in Firefox extension storage and are never exposed to streaming pages, the popup, or logs.

Disconnecting removes local credentials and Mireki's local completion state, while also attempting to revoke remote Trakt access. Firefox extension storage is controlled by the extension but is not encrypted against someone with access to the local Firefox profile or operating system account.

## Development and Firefox debugging

Mireki uses native JavaScript and does not require a build step or runtime dependencies.

### Temporary installation

1. Open `about:debugging` in Firefox.
2. Select **This Firefox**.
3. Choose **Load Temporary Add-on…**.
4. Select this repository's `manifest.json`.
5. Accept access to the supported streaming services, then pin Mireki to the toolbar.

Firefox removes temporary extensions when the browser closes.

### Run with web-ext

With Node.js 24 or newer:

```sh
npx --yes web-ext@10.5.0 run --source-dir .
```

### Run project checks

```sh
node --test
npx --yes web-ext@10.5.0 lint --source-dir .
```

Pushes and merges to `develop` run the complete test, syntax, manifest, and extension lint checks through GitHub Actions.

## License

Mireki is available under the [MIT License](LICENSE).
