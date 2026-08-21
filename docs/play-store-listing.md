# Google Play listing

This document is the source of truth for the initial English (United Kingdom) Google Play listing and its app-content declarations. It does not authorize publishing, review submission, track changes, or release creation.

## Store listing

- Language: English (United Kingdom) (`en-GB`)
- App name: Switchify Remote
- Category: Tools
- Tag: Remote control
- Privacy policy: https://switchifyapp.com/privacy/remote
- Public email: owen@switchifyapp.com
- Public website: https://switchifyapp.com
- Public phone: none
- External marketing: keep the existing Play Console setting unchanged

The Remote-specific policy must be live at the URL above, and the installed internal build must expose the same policy from Settings, before saving Data safety.

### Short description

```text
Accessible mouse, typing and window controls for Windows PCs and Macs.
```

### Full description

```text
Switchify Remote lets you control a Windows PC or Mac from an Android phone or tablet over Bluetooth Low Energy. It is the companion app for Switchify PC.

Pair securely with your computer, then choose the controls you need:

• Mouse controls for pointer movement, clicks, dragging, scrolling, pointer speed and multiple monitors
• Typing controls for live text, drafts and common computer keys
• Window controls for switching apps, task view, desktop, minimize, maximize, close and shortcuts
• Optional Switch Forwarding from the main Switchify Android app when supported

Built for access:

• Works with TalkBack and Switch Access
• Large touch targets and labels that scale without being cut off
• Light and dark themes, reduced-motion support, and phone and tablet layouts
• Clear selected, disabled, busy and connection states

Privacy and security:

• No account, ads, analytics or cloud sync in Switchify Remote
• Authenticated Bluetooth pairing with approval on the computer
• Pairing credentials are stored securely on your Android device
• Typed text and control commands go only to the paired computer
• Diagnostics are stored locally and exclude typed text, commands and pairing secrets

Requires Switchify PC on Windows 10 or later, or an Apple-silicon Mac running macOS 13 or later, with Bluetooth Low Energy. Download Switchify PC from github.com/switchifyapp/switchify-pc/releases.
```

## App-content declarations

### App access

Declare that some functionality is restricted because the remote-control actions require Switchify PC on another device. Provide these reviewer instructions:

```text
Switchify Remote has no account or login. It requires a Bluetooth Low Energy computer running Switchify PC: Windows 10 or later, or macOS 13 or later on Apple silicon. Download the Windows setup or macOS DMG from https://github.com/switchifyapp/switchify-pc/releases. Open Switchify PC and enable Bluetooth and input access. In Remote, select PCs > Find nearby PCs, choose the computer, compare the six-digit code, and approve it there. Mouse, Typing and Window controls then become available.
```

### Ads and identifiers

- Ads: No, the app does not contain ads.
- Advertising ID: No, the app does not use the Advertising ID.
- Confirm that the generated release manifest does not request `com.google.android.gms.permission.AD_ID` before saving this answer for a new native build.

### Audience and regulated content

- Target age groups: 13–15, 16–17, and 18 and over.
- The app is not directed at children and is not designed to appeal to children.
- Government app: No.
- Financial features: None.
- Health features: None.

### Data safety

The intended declaration is that the app does not collect or share required user-data types. Switchify Remote has no account, analytics, telemetry, advertising, cloud sync, or app-originated internet transport. Preferences stay on the device. Sanitized diagnostics stay on the device unless the user explicitly copies or exports them through the operating system. The device identifier and pairing tokens use secure device storage. User-directed text and control commands travel over Bluetooth only to the computer that the user pairs and approves; they are not sent to the developer or a third party.

Save this declaration only after `v1.0.0-beta.5` is available to internal testers, the Remote-specific policy is public, and the Settings link has been checked in the installed build.

Re-evaluate this declaration before saving if dependencies, diagnostics, networking, storage, or data handling change.

### Content rating

- Category: All Other App Types.
- Rating contact email: owen@switchifyapp.com.
- Answer No to questionnaire items about violence, sexuality, language, controlled substances, gambling, user-generated content, user communication, purchases, location sharing, and unrestricted web access.
- Review the calculated rating before saving. A materially higher result than the general-audience rating expected for this utility requires investigation.

## Store visual assets

Upload these files from `docs/play-store-assets`:

- Listing icon: `../../assets/images/switchify-remote-play-store.png`, 512 x 512
- Feature graphic: `feature-graphic.png`, 1024 x 500
- Phone screenshots: the five opaque 1080 x 1920 PNGs under `phone/`, in filename order

Keep the promotional video, tablet, Chromebook, and XR sections empty. The screenshot captures must use a generic computer name and must not contain pairing codes, typed text, credentials, diagnostics, personal identifiers, developer controls, or notification contents.

The editable feature graphic is under `source/`. Rebuild the final assets with:

```text
node scripts/generate-play-store-assets.cjs --source-dir <sanitized-capture-directory>
```

Run `npm test -- --runInBand scripts/play-store-assets.test.js` after regeneration.

## Console completion guardrails

- Save category, contact details, Data safety, and store-listing changes as drafts.
- Pause for confirmation before entering the public contact email and before each Console save.
- Do not send changes for review, create a closed test, or publish to production.
- Confirm all 11 setup tasks are complete after saving, or record any new task Play Console adds.
