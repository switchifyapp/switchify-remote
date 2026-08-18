# Switchify Remote development guidelines for AI agents

## Project overview

Switchify Remote is an accessibility-first Expo SDK 57 React Native application for Android and iOS. It discovers, pairs with, and controls Switchify PC over Bluetooth Low Energy through Mouse, Typing, and Window remote surfaces.

The application uses TypeScript, React 19, React Native 0.86, Expo Router, and native BLE modules. Use Node.js 24 and npm for all repository work.

## Development workflow

Follow this workflow for every change:

1. Create a GitHub issue that defines the change and acceptance criteria.
2. Fetch the intended base branch and create a focused `codex/<description>-<issue>` branch from it. Use `main` unless the issue or user identifies another base.
3. Inspect neighboring code, tests, documentation, and configuration before editing.
4. Make the smallest coherent change that satisfies the issue.
5. Run `npm run validate` from the repository root. Add platform build or physical-device evidence when the change requires it.
6. Commit only the intended files with a concise Conventional Commit message.
7. Push the branch and open a draft pull request against the selected base. The PR must include `Closes #<issue>`, a summary, and validation evidence.
8. Ask an independent agent to review the latest head. Address every actionable finding and repeat the review whenever the head changes.
9. Require green CI before handoff. Never merge without explicit user instruction.

Do not silently include unrelated working-tree changes. Do not rewrite, discard, or overwrite changes that belong to the user.

## Code and architecture

- Follow existing TypeScript, React, Expo Router, component, hook, transport, storage, and domain patterns. Inspect nearby files before introducing a new abstraction.
- Prefer existing libraries and utilities. Confirm a dependency is present before using it, and justify any new dependency.
- Keep UI components focused on rendering and interaction. Put connection, transport, protocol, persistence, and command behavior in their existing layers.
- Preserve typed interfaces at layer boundaries. Avoid `any`, unsafe casts, unhandled promises, and module-level mutable connection state.
- Use clear names and self-documenting code. Add comments only when they explain a non-obvious constraint or invariant.
- Keep platform-specific behavior explicit and contained. Maintain equivalent Android and iOS behavior unless a platform limitation is documented.
- Handle errors without exposing sensitive information, and ensure async resources are released on cancellation, navigation, disconnect, and unmount.

## Accessibility and UI

- Treat accessibility as a functional requirement. Preserve screen-reader labels, roles, hints, focus order, state announcements, scalable text, contrast, and large touch targets.
- Follow the existing design system and shared UI components before adding one-off styling.
- Support light and dark appearance, device safe areas, and phone and tablet layouts where the surrounding screen does.
- Keep primary actions usable with assistive technologies and avoid interactions that rely only on color, gestures, animation, or precise pointer input.
- Validate user-facing changes against `docs/accessibility.md`. Update its acceptance criteria when intended behavior changes.

## Expo and native configuration

- BLE requires native code. Use Expo development builds; Expo Go is unsupported.
- Read the exact Expo SDK 57 documentation before changing Expo configuration, native modules, config plugins, permissions, deployment targets, or generated projects.
- Treat `app.json` and files under `plugins/` as the source of truth for generated native configuration.
- Do not hand-edit generated `android/` or `ios/` output when the change belongs in Expo configuration or a config plugin. Verify config-plugin changes with clean prebuilds for every affected platform.
- Preserve the Android minimum SDK, iOS deployment target, application identifiers, permission descriptions, and native build settings unless the issue explicitly changes them.
- Do not commit local SDK paths, signing material, credentials, provisioning data, keystores, or machine-specific property files.

## Bluetooth, protocol, and lifecycle safety

- Preserve Switchify PC protocol v1, canonical authentication, service and characteristic identifiers, framed transport bounds, command schemas, pairing approval, and deterministic cleanup.
- Treat all received BLE data as untrusted. Validate lengths, framing, states, and authentication before processing or dispatching commands.
- Keep discovery, connection, pairing, reconnect, timeout, cancellation, and disconnect behavior deterministic. Stop scans, subscriptions, timers, and pending work on every terminal path.
- Never weaken authentication, pairing approval, replay resistance, frame limits, or error sanitization for convenience.
- Protocol or persisted-data changes require compatibility tests and corresponding updates to `docs/protocol-compatibility.md`.
- Changes that affect the native Android bridge must remain consistent with `docs/android-bridge.md`.

## Security and privacy

- Never log, expose, persist unnecessarily, or include in analytics, diagnostics, fixtures, screenshots, bug reports, or error messages: typed text, pairing tokens, authentication proofs, verification material, signing secrets, or credentials.
- Store sensitive pairing state only through the established secure-storage boundary. Preserve data minimization and sanitize all user-visible and diagnostic errors.
- Do not add telemetry, accounts, cloud synchronization, remote logging, or third-party data collection unless the issue explicitly requires and reviews it.
- Never commit secrets or placeholder secrets. If local or CI credentials are required, document the secret name and ask the user to configure it outside the repository.

## Testing and validation

- Run the complete check with `npm run validate`. It runs lint, TypeScript checking, Jest in CI mode, and Expo Doctor.
- Add or update tests for changed behavior. Prefer behavior-level assertions over implementation details.
- Automated tests must use fake Bluetooth transports and fake command adapters. They must never require nearby Bluetooth hardware or type, click, scroll, move a real pointer, switch windows, or otherwise inject real input.
- Cover success, cancellation, timeout, malformed input, disconnect, cleanup, and sanitized-error paths where relevant.
- Compatibility-sensitive protocol and persistence changes need regression tests for existing v1 behavior and previously stored data.
- For native configuration changes, verify clean Expo prebuilds and the affected native builds in addition to `npm run validate`.
- Use `docs/physical-smoke-test.md` for physical-device validation. Keep manual hardware checks separate from automated tests.

## Performance and reliability

- Avoid expensive work on the React Native UI thread. Bound parsing, queues, retries, scans, timers, and buffered transport data.
- Prevent duplicate scans, listeners, connections, commands, and reconnect attempts. Use timeouts and cancellation for operations that can stall.
- Keep high-frequency remote input responsive without allowing unbounded work or stale commands after disconnect.
- Clean up native subscriptions and asynchronous resources deterministically to prevent memory leaks and state updates after unmount.

## Release safety

- Keep `package.json` and `app.json` versions aligned for releases. Preserve semantic prerelease versions while the app remains in preview.
- Treat Android `versionCode`, signing configuration, bundle identifiers, and store credentials as release-critical configuration.
- Published GitHub releases trigger the Play internal-testing workflow. The release tag must match the Expo and package versions, be marked as a prerelease, contain a prerelease version, and point to a commit contained in `main`.
- Never expose, print, or commit the upload keystore, its passwords, the key alias, or the Play service-account JSON.
- Before handoff, confirm the draft PR targets the intended base, CI is green, validation evidence is recorded, and no merge has occurred without explicit approval.
