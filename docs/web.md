# Web app

Switchify Remote also runs as a web app built with Expo web. It uses the same screens, protocol client, pairing and layouts as the native apps. Only the platform layer is different.

## Running

```sh
npm run web                 # development server
npx expo export -p web      # static site in dist/
```

Web Bluetooth only works in a secure context, so serve the exported site over HTTPS. `http://localhost` also counts as secure for development.

## Installing as an app

The web app is a progressive web app, so Chrome and Edge offer to install it to the home screen or desktop, where it opens in its own window.

- `public/manifest.json` sets the name, start URL, standalone display and colours. Its icons are in `public/icons/`: 192 and 512 pixel versions of the app icon, plus a maskable icon made from the Android adaptive foreground.
- `src/app/+html.tsx` links the manifest and registers `public/sw.js`. Registration only happens in production exports, so `npm run web` never caches Metro's development bundles.
- The service worker fetches pages from the network first and falls back to the cache when offline, so a new deployment is never stuck behind an old copy. Content-hashed bundles and assets under `/_expo/static/` and `/assets/` are cached once and reused. Bluetooth still needs the PC nearby; offline only means the app opens.
- `vercel.json` serves `sw.js` and the manifest with `no-cache`, and the hashed bundles as immutable. To change caching behaviour, change the `CACHE` name in `sw.js` so old caches are cleared on activation.

## Switch scanning

Switch users can operate Remote with keyboard-style switch interfaces, which send key presses such as Space or Enter. Scanning uses [@switchify/scanning](https://github.com/switchifyapp/switchify-scanning), the TypeScript port of Switchify PC's item scanner, so timing, passes, groups and hold actions behave as they do on the PC.

- **Settings:** turn it on in Settings → Switch scanning, which is off by default. Then choose automatic or manual movement, the scan speed, and how to group controls: "Sections" scans each section then its controls, "Rows" scans each section, then each row of a grid, then its controls, and "Every control" visits every control in turn. Assign each switch by choosing Set key and pressing the switch. Each switch has a press action and an optional hold action. Choosing Manual adds any missing Next or Previous switch on a free key (Enter and Backspace first, as in Switchify PC). Settings that cannot drive scanning are refused, for example ones with no Select.
- **Using it:** Select starts scanning, and Escape stops it. In grouped mode each surface section is one stop. Select enters it, its controls are scanned in turn, and a final "Leave section" stop returns to the page. In Rows mode each grid row of several controls is a stop of its own, ending with "Leave row". Open dialogs (selectors, the PC switcher, the layout editor and the action picker) confine scanning to themselves. Controls on hidden tabs are never scanned. The page only scrolls when the highlighted control is not fully visible, and it then centres the control smoothly (instantly with reduced motion), so the next few stops are already on screen. Automatic movement pauses while a switch is held. While pointer movement or a key is repeating, the next switch press stops the repeat and does nothing else, as on Switchify Android. Automatic scanning holds on the chosen control until the repeat stops.
- **Implementation:** `src/scanning/` holds the provider, the `useScannable` hook used by `ControlButton`, `ActionButton`, `IconButton`, `ListRow`, `SelectorField`, the PC switcher and the tab bar, the highlight rings, and the settings card. Scanning settings live in `switchify.remote.preferences.v1` under `scanning`, and unknown or unusable values fall back on their own.
- **Limits:** keys still type into a text field while one has focus, so live typing is not yet switch-accessible. Native builds have no global key events, so scanning is web-only for now.

## Supported browsers

Web Bluetooth is available in Chrome and Edge on Android, Windows, macOS and ChromeOS. Safari, Firefox and every iOS browser lack it. In those browsers the PCs screen shows that Bluetooth is unavailable and names the supported browsers.

## How the web differs

| Area | Native | Web |
|---|---|---|
| Transport | `ReactNativeBleTransport` (react-native-ble-plx) | `WebBluetoothTransport`, selected by `createBleTransport.web.ts` |
| Discovery | Background scan lists every nearby PC | The browser's device picker returns one chosen PC per search. Closing the picker returns to idle (`scan_cancelled`) without showing an error. If the browser refuses to open the picker, because the tap was too long ago or Bluetooth is blocked for the site, the app explains this and asks you to try again. |
| Saved PCs | Rescans and matches the desktop ID | Reuses devices this site may already use (`navigator.bluetooth.getDevices()`), matching by desktop ID. Otherwise it asks once through the picker, which needs a tap. If a remembered device fails to open, for example after a Windows PC changes its Bluetooth address, it is forgotten, so the next attempt looks the PC up again or asks through the picker. |
| Write size | Negotiated MTU (Android requests 517) | Fixed at 182 bytes (a 185-byte ATT MTU). The browser hides the negotiated MTU, and Switchify PC on macOS rejects long (offset) writes. |
| GATT concurrency | Native transaction queue | One GATT operation at a time, because browsers reject overlapping operations |
| Write cancellation | Cancels the native transaction | An in-flight write cannot be aborted, so cancelling waits up to one second for it to finish. That way disconnect cleanup (drag end, modifier release) still reaches the PC. Only a write that never finishes makes writes unavailable until the next connection, matching the native behaviour when cancellation fails. |
| Pairing secrets | Keychain / Keystore via `expo-secure-store` | AES-GCM ciphertext in `localStorage`, encrypted with a non-extractable key held in IndexedDB (`secretStorage.web.ts`). Clearing site data removes the pairing. Saving, removing and tidying saved PCs holds a cross-tab Web Lock (`storageLock.web.ts`), so two open tabs cannot drop each other's PCs. |
| Alerts | Native dialogs | `window.alert` and `window.confirm` (every app alert is a notice or a cancel plus one action) |
| Announcements | `AccessibilityInfo` | A polite ARIA live region (`installPlatform.web.ts`) |
| Diagnostics export | Share sheet | Text file download |
| Inactive tabs | Detached by the navigator | Removed from layout (`tabSceneLayout.web.tsx`), since the web navigator only hides them from screen readers and leaves their controls in the keyboard order |
| Android bridge and Switch Forwarding | Android only | Unavailable |

The protocol, framing limits, authentication and pairing approval are unchanged. See [protocol compatibility](protocol-compatibility.md).

First-time browser device identity creation uses an exclusive Web Lock, so tabs
share one persisted identity. Waiting for a lock is bounded to five seconds. If
locks are unavailable or persistence fails, initialization fails safely rather
than using an unsaved identity. Existing encrypted identities remain readable.
This keeps the existing keys, ciphertext format and native storage path unchanged.

Connection cancellation includes initial cleanup: a stopped or replaced attempt
must not reopen the picker or begin another connection after cleanup completes.

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

Connection discovery now reads status before looking up command and notification
characteristics, one operation at a time. Only PCs advertising `read-v1` are asked
for the read-response characteristic. Discovery shares one ten-second budget and
checks cancellation between operations. Diagnostics identify each lookup using
fixed labels, never browser error text or Bluetooth identifiers.

Issue #182 follows a real Chrome failure after status discovery and before pairing.
The current-code hardware retry narrowed the failure to primary-service discovery
after reconnecting. Sequential characteristic discovery alone did not fix it.
The web transport now explicitly retains the selected completed discovery probe
across scan stop and connection preparation. It reuses that live service and
rereads status before pairing; a changed desktop identity still fails. Normal
scan stop, explicit disconnect, cancellation and failed setup close the probe.
Native transports keep their existing preparation path. A successful real pairing
with this handoff remains required before release.

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
