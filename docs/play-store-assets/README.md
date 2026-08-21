# Google Play artwork

This directory contains the English (United Kingdom) artwork for the Switchify Remote default store listing.

## Final files

- `feature-graphic.png`: opaque 1024 by 500 feature graphic.
- `phone/01-pair.png`: Pair securely over Bluetooth.
- `phone/02-mouse.png`: Move, click and scroll.
- `phone/03-typing.png`: Type from your phone.
- `phone/04-window.png`: Manage windows quickly.
- `phone/05-access.png`: Made for accessible control.

The Play icon remains `assets/images/switchify-remote-play-store.png`.

## Regeneration

Edit `source/feature-graphic.svg` for the feature graphic. To rebuild all final files, provide a directory containing clean portrait captures named `01-pair.png` through `05-access.png`:

```text
node scripts/generate-play-store-assets.cjs --source-dir <capture-directory>
```

Use a production-style Android build at 1080 by 2400, 100% text scale, and a generic computer name. Clear notifications and exclude developer menus, pairing codes, typed text, credentials, and diagnostics before capture.
