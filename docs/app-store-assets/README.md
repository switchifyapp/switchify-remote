# App Store screenshots

These are the sanitized English (United Kingdom) screenshots for the Switchify Remote App Store listing.

- `iphone/`: five opaque 1242 by 2688 PNGs captured from iPhone 11 Pro Max.
- `ipad/`: five opaque 2048 by 2732 PNGs captured from iPad Pro 12.9-inch.
- Files are uploaded in filename order: pairing, Mouse, Typing, Window, and accessible Settings.

The source captures must come from a local iOS build made with `EXPO_PUBLIC_STORE_CAPTURE=1`. This exact build-time flag replaces the production root with a sanitized fixture using production UI components and `Demo PC`. It does not mount the connection provider, initialize Bluetooth, access pairing storage, or send commands. Normal, CI, and release builds must leave the flag unset.

The fixture cycles through pairing, Mouse, Typing, Window, and Settings every five seconds for deterministic simulator capture. A deep link to `switchify-remote://capture/<pair|mouse|typing|window|access>` can also select a screen during manual local capture. Then generate the branded outputs:

```text
npm run app-store:assets -- --iphone-source-dir <iphone-captures> --ipad-source-dir <ipad-captures>
```

Never include pairing codes, typed text, personal device names, credentials, diagnostics, notifications, or developer controls.
