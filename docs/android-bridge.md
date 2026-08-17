# Switchify Android bridge

Switchify Remote binds to the exported `com.enaboapps.switchify.remote.BIND_BRIDGE`
service in `com.enaboapps.switchify`. Android protects the service with
`com.enaboapps.switchify.permission.REMOTE_BRIDGE`, whose protection level is
`signature`. A development or release build can use physical-switch repeat stop
and PC Switch Forwarding only when both APKs are signed by the same certificate.

Before distributing either APK, compare the SHA-256 signer digests:

```shell
apksigner verify --print-certs switchify.apk
apksigner verify --print-certs switchify-remote.apk
```

The `Signer #1 certificate SHA-256 digest` values must match. A mismatch fails
closed: Android denies the bind and Remote continues touchscreen mouse repeat
with an accessible warning that a physical switch cannot stop it.

The bridge is foreground-only. Backgrounding Remote unbinds it; unbinding,
binder death, Accessibility-service cleanup, screen shutdown, and process exit
clear repeat and forwarding generations.
