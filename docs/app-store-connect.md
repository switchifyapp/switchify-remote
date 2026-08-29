# App Store Connect and internal TestFlight

Switchify Remote uses App Store Connect for internal TestFlight distribution and a saved public-listing draft. The canonical listing values and draft-only guardrails are in [App Store listing](app-store-listing.md). External testers and App Review remain separate work.

## Apple records

The Apple Developer and App Store Connect records must use these fixed values:

| Record                 | Value                                     |
| ---------------------- | ----------------------------------------- |
| Team                   | `4N2QY254XW`                              |
| Explicit App ID name   | `Switchify Remote`                        |
| Bundle ID              | `com.enaboapps.switchify.remote`          |
| App Store Connect name | `Switchify Remote`                        |
| Platform               | iOS, including iPad                       |
| Primary language       | English (UK)                              |
| SKU                    | `switchify-remote-ios`                    |
| User access            | Full Access                               |
| Privacy policy         | `https://switchifyapp.com/privacy/remote` |
| Feedback email         | `owen@switchifyapp.com`                   |
| Provisioning profile   | `Switchify Remote App Store`              |
| Internal group         | `Switchify Internal`                      |

The internal group automatically distributes compatible builds and initially contains only the current Account Holder. Do not add external testers or submit a build for beta or App Review as part of the internal release procedure.

The app declares `ITSAppUsesNonExemptEncryption=false`. Switchify Remote uses HMAC authentication and system Bluetooth security, but does not implement non-exempt encryption. Reassess this declaration before adding cryptographic functionality beyond those existing uses.

## GitHub credentials

The `TestFlight Internal Release` workflow reuses the Developer-role `Switchify PC Notarization CI` App Store Connect team API key. Configure these repository secrets:

- `ASC_API_KEY_ID`
- `ASC_API_ISSUER_ID`
- `ASC_API_PRIVATE_KEY_BASE64`
- `IOS_DISTRIBUTION_CERTIFICATE_BASE64`
- `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`
- `IOS_APP_STORE_PROVISIONING_PROFILE_BASE64`

Base64 values must contain the raw P8, password-protected P12, and App Store provisioning profile respectively. Never commit credentials, copy them into workflow logs, attach them to issues, or upload them as ordinary artifacts. Keep the originals in one encrypted local backup with access limited to the Account Holder.

The workflow creates a temporary keychain, installs the profile and API key only for the job, and removes the keychain, profile, P8, P12, extracted IPA, and staging directories in an unconditional cleanup step.

## Credential renewal

Apple Distribution certificates and App Store provisioning profiles expire. Before expiry:

1. Create a replacement Apple Distribution certificate in Xcode and export it as a password-protected P12.
2. Regenerate `Switchify Remote App Store` for the explicit App ID and replacement certificate.
3. Replace the three distribution-certificate/profile GitHub secrets together.
4. Update the encrypted local backup.
5. Dispatch the workflow for a new prerelease build and confirm its signature and embedded profile before revoking the old certificate.

The App Store Connect API key is reused while it remains active. If it is revoked, create a reviewed replacement with the minimum upload role and replace all three `ASC_API_*` secrets together. A P8 private key cannot be downloaded again.

## Internal release procedure

Follow [versioning](versioning.md) to prepare, review, merge, and publish a prerelease. Publication starts both the Play internal and TestFlight internal workflows. The TestFlight job:

1. verifies that the tag is a published prerelease, matches `package.json`, points to a commit contained in `main`, and has a monotonic shared build ordinal;
2. checks App Store Connect for the build before doing signing work;
3. checks out the exact release tag as application source and current `main` as reviewed workflow tooling;
4. performs a clean Expo iOS prebuild, installs CocoaPods, archives with manual App Store signing, and exports an IPA;
5. verifies the distribution signature, profile, application identifier, bundle ID, marketing version, build number, and export-compliance flag;
6. validates and uploads with `xcrun altool`; and
7. polls the App Store Connect API until the build is `VALID`.

An existing valid build is a successful no-op. An existing processing build is polled without uploading a duplicate. A `FAILED` or `INVALID` build must never be retried with the same ordinal; prepare a new prerelease build instead.

The manual dispatch input accepts only an existing published prerelease tag. Use it for the `v1.0.0-beta.11` build 13 backfill or an idempotent retry, not to bypass the normal release review process.

After processing, verify that the build appears in `Switchify Internal`, install it from TestFlight on the physical iPad, and run the Bluetooth pairing plus Mouse, Typing, Window, and quick-PC-switching checks from [the physical smoke test](physical-smoke-test.md).
