# Accessibility acceptance criteria

Switchify Remote is designed for VoiceOver, TalkBack, iOS Switch Control, and Android Switch Access.

- Every interactive target is at least 48 by 48 logical points and has a concise accessible name.
- Surface selection is one button that announces its current value and opens a modal option list. Options expose selected state, scanning stays inside the modal, and focus returns to the selector after selection or dismissal. Toggles expose selected or disabled state.
- Headings, connection changes, failures, repeat state, and pairing approval are announced without moving focus unexpectedly.
- The pairing code is announced one digit at a time.
- Text scales with the operating system; controls grow rather than shrinking text below the user's chosen size.
- Control labels are never truncated. Action groups reduce their columns as available width or text scale requires.
- Content remains operable in portrait, landscape, and tablet widths, with scrolling available at large text sizes.
- The palette maintains at least 4.5:1 contrast for normal text. Color is never the only status cue.
- Light and dark appearance follow the device setting. Both palettes maintain the same contrast and state-cue requirements.
- The primary tab bar contains PCs, Remote, and Settings. Diagnostics is available from Settings and uses a standard back action.
- Selected controls combine color with a check icon and selected accessibility state.
- Repeating pointer movement exposes a dedicated Stop movement button alongside the existing stop-on-control behavior.
- Switch scanning stops on actionable controls and scroll containers, not read-only headings, descriptions, status badges, summaries, or capability values.
- Unpairing a saved computer opens a native confirmation alert. Cancel and dismissal leave the pairing unchanged, and the destructive action names the computer before removing access.
- Scroll content clears the bottom tab bar, gesture area, and home indicator at maximum text size.
- No essential interaction depends on animation, gestures, precise timing, or simultaneous touch.

## Manual smoke test

On both platforms, enable the screen reader and then the platform switch-access feature. Navigate PCs, pairing, every available remote screen, Settings, and Diagnostics in logical order. Confirm every action can be selected, read-only text does not become a switch-scan stop, pointer repeat exposes Stop movement, held modifiers and drag expose state, disabled controls are announced, and backgrounding returns the desktop to a neutral input state. Open the Surface selector and confirm the underlying screen and bottom tabs are not scannable, options scan linearly, Close works, Android back and VoiceOver escape dismiss the modal, and focus returns to the selector after selection or dismissal. Press Unpair for a saved computer and confirm the native alert reads the full computer name. Verify Cancel, Android Back, and outside dismissal preserve the pairing, then confirm Unpair removes it. Repeat in light and dark appearance, at 200% text scaling, and with reduced motion enabled.
