# Switchify PC protocol compatibility

Switchify Remote is a protocol v1 client. It does not change the Bluetooth service, characteristic UUIDs, framed transport, desktop pairing records, or command schema.

The TypeScript compatibility suite carries the canonical authentication and pairing-code vectors from Switchify Android. Android requests the established 517-byte MTU, while both platforms adapt the inner frame payload so the encoded GATT value fits the negotiated ATT limit. Transport tests enforce the 160-byte maximum inner payload, 16 KiB message limit, 10-second partial timeout, duplicate and out-of-order handling, UTF-8 reassembly, response correlation, and sanitized failure behavior.

The active preview surface supports:

- connection ping and pointer profile negotiation;
- pointer speed and display navigation;
- mouse movement, repeat, click, scroll, and drag;
- whole-text and sequenced text-stream input;
- keys, shortcuts, and held modifiers;
- focused-window controls.

Switch profiles, system-wide Switch Forwarding, media controls, accounts, and subscriptions are outside this preview. Unknown capabilities use safe disabled defaults.

Authenticated `connection.ping` commands may include an optional `deviceName`. Current PC builds use it to refresh the saved display name for that authenticated device. Older PC builds ignore the extra payload field, and older Remote builds remain compatible because an empty ping is still valid. A sanitized `name_update_failed` response does not fail authentication; Remote retains the local name and retries it on a later connection. The name does not change the device ID, token, BLE identity, or pairing authorization.
