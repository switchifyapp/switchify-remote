# Google Play listing

This document is the source of truth for the initial English (United Kingdom) Google Play listing and its app-content declarations. It does not authorize publishing, review submission, track changes, or release creation.

## Store listing

- Language: English (United Kingdom) (`en-GB`)
- App name: Switchify Remote
- Category: Tools
- Tag: Remote control
- Privacy policy: https://switchifyapp.com/privacy
- Public email: owen@switchifyapp.com
- Public website: https://switchifyapp.com
- Public phone: none
- External marketing: keep the existing Play Console setting unchanged

### Short description

```text
Accessible mouse, typing and window controls for Switchify PC on Windows.
```

### Full description

```text
Switchify Remote lets you control a Windows PC from an Android phone or tablet over Bluetooth Low Energy. It is the companion app for Switchify PC.

Pair securely with your PC, then choose the controls you need:

• Mouse controls for pointer movement, clicks, dragging, scrolling, pointer speed and multiple monitors
• Typing controls for live text, drafts and common PC keys
• Window controls for switching apps, task view, desktop, minimize, maximize, close and shortcuts
• Optional Switch Forwarding from the main Switchify Android app when supported

Built for access:

• Works with TalkBack and Switch Access
• Large touch targets and labels that scale without being cut off
• Light and dark themes, reduced-motion support, and phone and tablet layouts
• Clear selected, disabled, busy and connection states

Privacy and security:

• No account, ads, analytics or cloud sync in Switchify Remote
• Authenticated Bluetooth pairing with approval on the PC
• Pairing credentials are stored securely on your Android device
• Typed text and control commands go only to the paired PC
• Diagnostics are stored locally and exclude typed text, commands and pairing secrets

Requires Switchify PC on a Windows 10 or later computer with Bluetooth Low Energy. Download Switchify PC from switchifyapp.com.
```

## App-content declarations

### App access

Declare that some functionality is restricted because the remote-control actions require Switchify PC on another device. Provide these reviewer instructions:

```text
Switchify Remote has no account, membership, payment or login credentials. Its remote-control functions require a Windows 10 or later PC with Bluetooth Low Energy running Switchify PC. Install Switchify PC from https://switchifyapp.com/download/pc, open it, enable Bluetooth and input access, then select PCs > Find nearby PCs in Switchify Remote. Choose the PC, compare the six-digit code on both devices, and approve the request on the PC. The Mouse, Typing and Window controls become available after pairing.
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

Declare that the app does not collect or share required user-data types. Switchify Remote has no account, analytics, telemetry, advertising, cloud sync, or app-originated internet transport. Preferences and sanitized diagnostics stay on the device. The device identifier and pairing tokens use secure device storage. User-directed text and control commands travel over Bluetooth only to the PC that the user pairs and approves; they are not sent to the developer or a third party.

Re-evaluate this declaration before saving if dependencies, diagnostics, networking, storage, or data handling change.

### Content rating

- Category: All Other App Types.
- Rating contact email: owen@switchifyapp.com.
- Answer No to questionnaire items about violence, sexuality, language, controlled substances, gambling, user-generated content, user communication, purchases, location sharing, and unrestricted web access.
- Review the calculated rating before saving. A materially higher result than the general-audience rating expected for this utility requires investigation.

## Deferred visual assets

Leave every visual asset unchanged in this pass:

- App icon
- Feature graphic
- Promotional video
- Phone screenshots
- Seven-inch tablet screenshots
- Ten-inch tablet screenshots

Add sanitized screenshots only after device capture and accessibility review. Screenshots must not contain pairing tokens, authentication material, typed text, credentials, or identifying diagnostics.
