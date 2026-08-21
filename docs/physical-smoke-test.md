# Physical development-preview smoke test

Record the app commit, Switchify PC release, phone model/OS, and desktop platform for each run. Never paste pairing credentials or typed personal content into the record.

Run the matrix on a physical Android phone and iPhone against current Switchify PC on both Windows and macOS:

1. Install a native development build; confirm Expo Go is not offered as a supported path.
2. Deny Bluetooth once, verify the explanation, then grant access and discover the desktop.
3. Pair and verify the six-digit code on both devices. Reject a second request and confirm the mobile error is sanitized.
4. Disconnect and reconnect from Saved PCs, select and clear a default PC, then press Unpair. Confirm Cancel, Android Back, and outside dismissal preserve the pairing. Confirm Unpair removes it and re-pairing is required.
   - On the OPD2403 against Windows, complete at least 20 connections and reconnects. Confirm controls become ready every time. Simulate one dropped pointer-profile response and confirm the app shows "Restoring controls" before controls appear without another reconnect.
5. Exercise eight-way movement, repeat/stop, all clicks, both scroll directions, drag cleanup, speed limits, and monitor movement.
6. Exercise live typing, backspace/replacement, stream recovery, draft persistence/send/clear, and every displayed PC key using non-sensitive fixture text.
7. Exercise held modifiers, shortcuts, app switching, task view, desktop, minimize, maximize, and close. Confirm labels follow Windows/macOS conventions.
8. With VoiceOver/TalkBack and Switch Control/Switch Access, traverse every destination at maximum text size in portrait and landscape. Confirm selected, disabled, busy, error, and pairing states are announced.
   - Test a 320–428 point phone at 100%, 150%, and 200% text in light and dark appearance. Confirm headers stack, labels remain complete, action grids reduce columns, and the last control scrolls clear of the tab bar and system gesture area.
   - Rename a paired PC to a long fixture name. Confirm the Remote status, PC card, and Unpair control wrap without truncation.
   - Open each Surface, Opening surface, and Hold to stop selector. Confirm only the selector is a scan stop while closed; while open, only the modal options and Close are scanned. Confirm selection, Close, Android back, scrim dismissal, and VoiceOver escape restore focus to the selector.
   - Repeat on a tablet at normal and maximum text size. Confirm two-column and two-pane layouts collapse when enlarged text needs the width.
9. While repeat, drag, modifiers, and a text stream are active, background and terminate the app, disconnect Bluetooth, and quit Switchify PC. Confirm the desktop returns to neutral input state each time.
10. Export diagnostics and verify that no typed content, token, authentication proof, nonce, or verification code appears.

The development-preview PR remains draft until all four platform pairings are recorded successfully.
