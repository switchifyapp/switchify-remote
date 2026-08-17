# Accessibility acceptance criteria

Switchify Remote is designed for VoiceOver, TalkBack, iOS Switch Control, and Android Switch Access.

- Every interactive target is at least 48 by 48 logical points and has a concise accessible name.
- Surface selection exposes tab roles and selected state. Toggles expose selected or disabled state.
- Headings, connection changes, failures, repeat state, and pairing approval are announced without moving focus unexpectedly.
- The pairing code is announced one digit at a time.
- Text scales with the operating system; controls grow rather than shrinking text below the user's chosen size.
- Content remains operable in portrait, landscape, and tablet widths, with scrolling available at large text sizes.
- The palette maintains at least 4.5:1 contrast for normal text. Color is never the only status cue.
- No essential interaction depends on animation, gestures, precise timing, or simultaneous touch.

## Manual smoke test

On both platforms, enable the screen reader and then the platform switch-access feature. Navigate PCs, pairing, all three remote surfaces, Settings, and Diagnostics in logical order. Confirm every action can be selected, held modifiers and drag expose state, disabled controls are announced, and backgrounding returns the desktop to a neutral input state.
