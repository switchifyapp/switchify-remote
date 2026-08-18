# App versioning

Switchify Remote uses separate identifiers for the release, the user-visible app version, and the store build. Releases are prepared manually when a new Play internal or future TestFlight upload is needed; merging to `main` does not publish a build.

## Version fields

| Purpose | Source | Example |
| --- | --- | --- |
| Release identifier and Git tag | `package.json` `version` | `0.1.0-alpha.2` and `v0.1.0-alpha.2` |
| Android and iOS marketing version | `app.json` `expo.version` | `0.1.0` |
| Global store build | `android.versionCode` and `ios.buildNumber` | `2` and `"2"` |

The package version uses Semantic Versioning with an optional `alpha.N`, `beta.N`, or `rc.N` suffix. The Expo version is always the numeric `MAJOR.MINOR.PATCH` core so it is valid as both Android `versionName` and iOS `CFBundleShortVersionString`.

Both platforms share one positive build ordinal. Increment it for every store upload, including a rebuild from otherwise unchanged source. Never reset it for a new marketing version. Switchify Remote versions are independent from Switchify PC and Switchify Android.

Use alpha releases for incomplete internal previews, beta releases for feature-complete testing, release candidates for intended stable builds, and an unsuffixed version for stable releases. Before `1.0.0`, an incompatible change advances the minor version; compatible fixes advance the patch version.

## Prepare a version

Create a release issue and branch through the normal contributor workflow. From a clean branch, run:

```sh
npm run version:bump -- 0.1.0-alpha.2
npm run validate
```

The bump command requires a release identifier greater than the current one, derives the numeric marketing version, increments the shared build ordinal by exactly one, and updates `package.json`, `package-lock.json`, and `app.json`. Review all three changes in the release PR.

After the release PR is reviewed, green, approved, and merged, publish a GitHub prerelease from the merge commit with a tag exactly matching `v` plus the package version. The Play internal workflow rejects a mismatched tag, a stable release, a commit outside `main`, or a build ordinal that is not greater than every earlier reachable release tag.

The current workflow supports prereleases on the Play internal track only. Do not publish a stable or production release until a separately reviewed production workflow exists.
