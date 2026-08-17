# Switchify Remote

Switchify Remote is the accessibility-first Android and iOS companion for controlling Switchify PC over Bluetooth. The development preview provides PC discovery and pairing plus Mouse, Typing, and Window control surfaces.

The app uses Expo SDK 57 with native Bluetooth support. It does **not** run in Expo Go.

## Requirements

- Node.js 24
- npm
- Android Studio for Android development builds
- Xcode 26.6 or newer on macOS for iOS development builds

## Development

```sh
npm ci
npm run android
# On macOS:
npm run ios
```

Run the complete repository validation with:

```sh
npm run validate
```

Automated tests use fake transports and never require Bluetooth hardware or inject input. Pairing tokens and typed text must never appear in logs, diagnostics, fixtures, or bug reports.

See [protocol compatibility](docs/protocol-compatibility.md), the [accessibility acceptance criteria](docs/accessibility.md), and the [physical-device smoke test](docs/physical-smoke-test.md) for preview validation.

## Preview scope

The `v0.1.0-alpha.1` milestone is a development preview. It has no accounts, subscriptions, telemetry, Accessibility service, system-wide Switch Forwarding, or store submission.

The generated native projects target Android 7 (API 24) and iOS 16.4 or newer.

## License

Switchify Remote is licensed under the GNU Affero General Public License v3.0.
