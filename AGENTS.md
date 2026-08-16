# Contributor guidance

Switchify Remote is an Expo SDK 57 React Native application for Android and iOS. Read the exact versioned Expo documentation before changing native configuration.

Start every change with a GitHub issue and a scoped `codex/` branch from the appropriate base. Open a draft pull request with a closing reference and validation evidence. Before handoff, use an independent agent to review the latest head, address every actionable finding, repeat review after head changes, and require green CI. Never merge without explicit user instruction.

Use Node.js 24 and npm. Run `npm run validate` from the repository root. Automated tests must use fake Bluetooth and command adapters; they must never type, click, move a real pointer, or require nearby Bluetooth hardware.

Preserve Switchify PC protocol v1, canonical authentication, framed transport bounds, sanitized errors, pairing approval, and deterministic cleanup. Never log or expose typed text, pairing tokens, authentication proofs, or verification material. Protocol and persisted-data changes require compatibility tests.

BLE uses native code and therefore requires Expo development builds. Expo Go is unsupported.
