# Switchify PC protocol compatibility

Switchify Remote is a protocol v1 client. It does not change the Bluetooth service, characteristic UUIDs, framed transport, desktop pairing records, or command schema.

Custom section layouts use the separate `switchify.remote.layouts.v2` storage key with `{ version: 2, layouts: { [surface]: { [section]: { columns, cells } } } }`. Fixed section names are unchanged. All existing action IDs and v2 grids remain supported; action IDs are now validated against the shared catalog and surface placement rules instead of their original section. Draft actions are accepted only on Typing. An action may appear once in each section, including sections on different surfaces. Missing, malformed, oversized, unknown-version, duplicate-control, or unknown-action or forbidden-placement section data falls back independently to original section presentation. Version 1 flat layouts are deliberately ignored: their format cannot preserve section boundaries. Existing preference and pairing keys are unchanged, and old builds ignore the v2 key. Hidden capability/mode sections retain saved grids; visible controls continue to use current capability checks and dynamic labels. Records contain no command payloads, text, or authentication material.

The TypeScript compatibility suite carries the canonical authentication and pairing-code vectors from Switchify Android. Android requests the established 517-byte MTU, while both platforms adapt the inner frame payload so the encoded GATT value fits the negotiated ATT limit. Transport tests enforce the 160-byte maximum inner payload, 16 KiB message limit, 10-second partial timeout, duplicate and out-of-order handling, UTF-8 reassembly, response correlation, and sanitized failure behavior.

The active preview surface supports:

- connection ping and pointer profile negotiation;
- pointer speed and display navigation;
- mouse movement, repeat, click, scroll, and drag;
- repeating navigation keys;
- whole-text and sequenced text-stream input;
- keys, shortcuts, and held modifiers;
- focused-window controls.

Switch profiles, system-wide Switch Forwarding, media controls, accounts, and subscriptions are outside this preview. Unknown capabilities use safe disabled defaults.

Repeating keys reuse the existing repeat envelope rather than adding a command. `mouse.repeat.start` already carries a nested command, and its `command.type` now also accepts `keyboard.key` with a single-field `{ "key": "ArrowDown" }` payload; `mouse.repeat.stop` remains the one stop for every repeat kind. Despite the name, that pair is the generic repeat envelope. The desktop advertises a `keyRepeat` capability alongside `mouseRepeat`, carrying `supported`, `enabled`, `intervalMs`, `initialDelayMs`, `minIntervalMs`, `maxIntervalMs`, and the `repeatableKeys` allowlist. Only the arrow keys, `Tab`, `Backspace`, `Delete`, `PageUp`, and `PageDown` repeat: printable characters would flood text, modifiers are already latched through `keyboard.modifierDown`, and `Enter` would re-submit on every tick. Because the list is advertised, a desktop can widen it without a Remote release.

Both skew directions degrade safely. A PC build without the capability parses as `supported: false`, so Remote sends a single `keyboard.key` press and never emits the nested keyboard shape; the same fallback covers a desktop that has key repeat switched off or that omits the requested key from `repeatableKeys`. An older Remote never constructs the nested keyboard shape, and the `mouseRepeat` capability it reads is unchanged. Repeats are a toggle on both sides, so any following control stops one; physical-switch stop and session cleanup are repeat-kind agnostic and need no bridge change. Keys in live Typing continue to use the text stream so chunk sequencing is preserved, and are never repeated.

Authenticated `connection.ping` commands may include an optional `deviceName`. Current PC builds use it to refresh the saved display name for that authenticated device. Older PC builds ignore the extra payload field, and older Remote builds remain compatible because an empty ping is still valid. A sanitized `name_update_failed` response does not fail authentication; Remote retains the local name and retries it on a later connection. The name does not change the device ID, token, BLE identity, or pairing authorization.

## Shared remote actions

The catalog contains only stable IDs, descriptive searchable metadata, placement rules, and declarative action definitions. The runtime resolver attaches current platform labels, selected/disabled states, explanations, and callbacks from the active RemoteSession. Both original and customized grids use it. Monitor behavior is defined once; keys in live Typing use its stream and Enter controller, while keys elsewhere use normal PC key commands. Draft actions require draft mode and applicable text/capabilities. Picker selection handles IDs only. Layout storage contains no handlers, search text, typing content, or command payloads. Reconnection refreshes runtime state without rewriting layouts.
