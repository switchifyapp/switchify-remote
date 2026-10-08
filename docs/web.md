# Web app

Switchify Remote also runs as a web app built with Expo web. It uses the same screens, protocol client, pairing and layouts as the native apps. Only the platform layer is different.

## Running

```sh
npm run web                 # development server
npx expo export -p web      # static site in dist/
```

Web Bluetooth only works in a secure context, so serve the exported site over HTTPS. `http://localhost` also counts as secure for development.

## Supported browsers

Web Bluetooth is available in Chrome and Edge on Android, Windows, macOS and ChromeOS. Safari, Firefox and every iOS browser lack it. In those browsers the PCs screen shows that Bluetooth is unavailable and names the supported browsers.

## How the web differs

| Area | Native | Web |
|---|---|---|
| Transport | `ReactNativeBleTransport` (react-native-ble-plx) | `WebBluetoothTransport`, selected by `createBleTransport.web.ts` |
| Discovery | Background scan lists every nearby PC | The browser's device picker returns one chosen PC per search. Closing the picker returns to idle (`scan_cancelled`) without showing an error. If the browser refuses to open the picker, because the tap was too long ago or Bluetooth is blocked for the site, the app explains this and asks you to try again. |
| Saved PCs | Rescans and matches the desktop ID | Reuses devices this site may already use (`navigator.bluetooth.getDevices()`), matching by desktop ID. Otherwise it asks once through the picker, which needs a tap. |
| Write size | Negotiated MTU (Android requests 517) | Fixed at 182 bytes (a 185-byte ATT MTU). The browser hides the negotiated MTU, and Switchify PC on macOS rejects long (offset) writes. |
| GATT concurrency | Native transaction queue | One GATT operation at a time, because browsers reject overlapping operations |
| Write cancellation | Cancels the native transaction | An in-flight write cannot be aborted, so cancelling waits up to one second for it to finish. That way disconnect cleanup (drag end, modifier release) still reaches the PC. Only a write that never finishes makes writes unavailable until the next connection, matching the native behaviour when cancellation fails. |
| Pairing secrets | Keychain / Keystore via `expo-secure-store` | AES-GCM ciphertext in `localStorage`, encrypted with a non-extractable key held in IndexedDB (`secretStorage.web.ts`). Clearing site data removes the pairing. |
| Alerts | Native dialogs | `window.alert` and `window.confirm` (every app alert is a notice or a cancel plus one action) |
| Announcements | `AccessibilityInfo` | A polite ARIA live region (`installPlatform.web.ts`) |
| Diagnostics export | Share sheet | Text file download |
| Inactive tabs | Detached by the navigator | Removed from layout (`tabSceneLayout.web.tsx`), since the web navigator only hides them from screen readers and leaves their controls in the keyboard order |
| Android bridge and Switch Forwarding | Android only | Unavailable |

The protocol, framing limits, authentication and pairing approval are unchanged. See [protocol compatibility](protocol-compatibility.md).

## Typing and probe recovery

Keyboard Enter in live typing sends one Enter, clears only after acknowledgement,
and returns focus to the input. The visible Enter and Retry Enter controls use the
same delivery path. Draft Enter continues to insert a newline without sending.
RN Web 0.21 requires `blurOnSubmit` for this multiline live input; native platforms
continue to use `submitBehavior` without a blur override.

Remembered-device probes have disposable connections and do not occupy the active
session's GATT queue. A stalled probe must time out and disconnect before fallback
selection, and a late probe completion must not affect the chosen PC.

## Hardware validation still needed

Automated tests use fake Web Bluetooth devices. Before release, check on real hardware:

- pairing and control from Chrome on Android against Switchify PC on Windows and on macOS
- that 182-byte writes are accepted on each PC platform, and the reconnect behaviour after a PC restarts
- saved-PC reconnection after a browser restart, both with and without `getDevices()` support

## Browser review, 2026-10-08

The issue #180 fixes were checked with computer control against a production Expo
web export served on loopback. An isolated test server substituted a fake
`navigator.bluetooth` before app startup; no PC input or real Bluetooth access was
used. The fixture was outside the shipped app, counted commands without retaining
their text, and was not included in the export.

- Onboarding, discovery, pairing, profile negotiation, and a mouse click completed.
- Keyboard Enter cleared live text and returned focus after one Enter command.
- The visible Enter control also cleared text; fresh typing sent no backspaces.
- A failed Enter retained text and focus; Retry Enter succeeded without resending
  chunks or sending backspaces.
- Draft Enter inserted a newline without increasing the command counts.
- Reloading exercised a remembered device whose status read never settled. After
  its three-second budget, fallback selected the fake PC and restored controls.
  Keyboard Enter continued to work on the new connection.

This is browser UI and fake-transport evidence, not physical Windows/macOS BLE or
screen-reader certification. The hardware checks above remain required.
