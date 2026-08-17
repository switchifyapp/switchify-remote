# Physical development-preview smoke test

Record the app commit, Switchify PC release, phone model/OS, and desktop platform for each run. Never paste pairing credentials or typed personal content into the record.

Run the matrix on a physical Android phone and iPhone against current Switchify PC on both Windows and macOS:

1. Install a native development build; confirm Expo Go is not offered as a supported path.
2. Deny Bluetooth once, verify the explanation, then grant access and discover the desktop.
3. Pair and verify the six-digit code on both devices. Reject a second request and confirm the mobile error is sanitized.
4. Disconnect and reconnect from Saved PCs, select and clear a default PC, then unpair and confirm re-pairing is required.
5. Exercise eight-way movement, repeat/stop, all clicks, both scroll directions, drag cleanup, speed limits, and monitor movement.
6. Exercise live typing, backspace/replacement, stream recovery, draft persistence/send/clear, and every displayed PC key using non-sensitive fixture text.
7. Exercise held modifiers, shortcuts, app switching, task view, desktop, minimize, maximize, and close. Confirm labels follow Windows/macOS conventions.
8. With VoiceOver/TalkBack and Switch Control/Switch Access, traverse every destination at maximum text size in portrait and landscape. Confirm selected, disabled, busy, error, and pairing states are announced.
9. While repeat, drag, modifiers, and a text stream are active, background and terminate the app, disconnect Bluetooth, and quit Switchify PC. Confirm the desktop returns to neutral input state each time.
10. Export diagnostics and verify that no typed content, token, authentication proof, nonce, or verification code appears.

The development-preview PR remains draft until all four platform pairings are recorded successfully.
