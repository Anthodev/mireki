# Changelog

## [Unreleased]

## [1.3.0] - 2026-10-19

### Features

- Resolve episodes from positive evidence: exact canonical, original, or requested-language titles combined with numeric hints. A localized title missing from Trakt no longer contradicts reliable coordinates, and only an exact title match can correct misnumbered coordinates.
- Fall back lazily to all-language episode translations when the requested language has no exact title, using bounded caches and no machine translation.
- Recognize a unique explicit Trakt absolute episode number for an E-only label on a single strong show once the canonical catalogue is known to be complete.
- Discover shows that only appear in broad search results when an episode is confirmed by both an exact title and a matching episode number.
- Generate GitHub release notes from the tagged `CHANGELOG.md` through `tools/release-notes.cjs`, enforcing tag, commit, and version agreement and checking the published release body against the tagged section.

### Changes

- Mark truncated episode catalogues as incomplete, so response and catalogue-size limits cannot justify a uniqueness-based correction.
- Separate provider-neutral playback-metadata interpretation from the shared Trakt resolver, keeping matching rules, raw display and saved correction identities unchanged.
- Run CI and release workflows on Avrea Ubuntu 24.04 runners with one vCPU.

### Fixes

- Show the popup's intermediate matching state without waiting for Trakt requests, and keep playback-expiry alarms armed while matching is pending.
- Preserve episode titles and explicit E-number hints alongside split-season labels such as `Season 2: Part 2`, without converting season parts into Trakt seasons on Netflix and Prime Video.
- Recover Netflix series headings and heading-plus-title scopes when an episode has no number, and replace the literal `Netflix` artist placeholder with the extracted series or none.

Full changelog: [v1.2.0...v1.3.0](https://github.com/Anthodev/mireki/compare/v1.2.0...v1.3.0)

## [1.2.0] - 2026-08-13

### Features

- feat: add privacy and scrobbling controls ([8e7950d](https://github.com/Anthodev/mireki/commit/8e7950d369d13d40e00868777bca4437023a8a02))

Full changelog: [v1.1.0...v1.2.0](https://github.com/Anthodev/mireki/compare/v1.1.0...v1.2.0)

## [1.1.0] - 2026-08-13

### Features

- feat: add manual Trakt match correction ([71465f3](https://github.com/Anthodev/mireki/commit/71465f3f0f0fdd40c35b1f00401f83921a14258b))

### Changes

- chore: updated README ([cb38b5a](https://github.com/Anthodev/mireki/commit/cb38b5ae4825e867ba74c6e652f0879bfbd9c26c))

Full changelog: [v1.0.0...v1.1.0](https://github.com/Anthodev/mireki/compare/v1.0.0...v1.1.0)

## [1.0.0] - 2026-07-19

### Features

- feat: prepare chrome support ([75db235](https://github.com/Anthodev/mireki/commit/75db235533c89eb905f47e2d962bb51101d98fa9))

### Fixes

- fix: login flow on firefox and chrome ([31d1075](https://github.com/Anthodev/mireki/commit/31d10757c267ccd8d5cd9f1242dea95638db07c2))
- fix(release): accept approved AMO packages ([ae4436c](https://github.com/Anthodev/mireki/commit/ae4436cc9f7106d241b40d9d570ffcd3606e5c51))

Full changelog: [v0.9.0...v1.0.0](https://github.com/Anthodev/mireki/compare/v0.9.0...v1.0.0)

## [0.9.0] - 2026-07-16

### Features

- feat(options): add configurable watched threshold ([10efbf7](https://github.com/Anthodev/mireki/commit/10efbf799836e9c7f656cf76416d96ebd1518c6d))
- feat(scrobble): raise watched threshold to 90% ([0b6b90f](https://github.com/Anthodev/mireki/commit/0b6b90f669fa1a21bd9350df77e92e0305104385))
- feat: improve playback and Trakt sync states + small redesign popup ([8ca9a78](https://github.com/Anthodev/mireki/commit/8ca9a7854e60fb771dee9cea1050c46c91ebf8fb))
- feat: new icon + removed header from popup ([970ea92](https://github.com/Anthodev/mireki/commit/970ea92a43c4ad2edfb67ae73b95bc8b622aa72d))
- feat: added trakt scrobbling ([0b4477a](https://github.com/Anthodev/mireki/commit/0b4477ad6a8bf0f331dd0d4454fc17e3f1b03f89))
- feat: added options screen + trakt oauth login implementation ([3f8a2e8](https://github.com/Anthodev/mireki/commit/3f8a2e8c9ea07def91d903779165f61771c0c3ef))
- feat: init + extension declaration + media detection + popup design ([c655adf](https://github.com/Anthodev/mireki/commit/c655adffe4b48f3f0c2d99a906e9fda3508bb1fb))

### Changes

- refactor: centralize episode label parsing across providers ([444bf6c](https://github.com/Anthodev/mireki/commit/444bf6cdb167a099a3c4cce52afdd038fa3ff8fe))
- ci(release): automate AMO and GitHub releases ([f21af7c](https://github.com/Anthodev/mireki/commit/f21af7cb5d71f4e54c18fafca737deb82bdfaaa4))
- feat: updated README.md ([ba795a3](https://github.com/Anthodev/mireki/commit/ba795a34125156e27c10ad2217e8183c5aaf4b1b))
- feat : added test ci ([bc8189e](https://github.com/Anthodev/mireki/commit/bc8189e18b95ae26a6a77245b9a6c9beef4810be))

### Fixes

- fix: improve Prime Video episode and artwork detection and matching ([c70d923](https://github.com/Anthodev/mireki/commit/c70d9232b1a68e184590b5b8e81273c8fdd8a7e9))
- fix(popup): add fallback artwork for media without images ([30474ab](https://github.com/Anthodev/mireki/commit/30474ab2d8202cf791d8fba929ee6773de8ed763))
- fix(scrobble): improve localized episode matching + improved Netflix support ([8391d5c](https://github.com/Anthodev/mireki/commit/8391d5c153e603ab71309e01b136f991f4c0a9da))

Full changelog: [commits/v0.9.0](https://github.com/Anthodev/mireki/commits/v0.9.0)
