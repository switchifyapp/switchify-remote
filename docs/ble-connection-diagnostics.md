# Bluetooth connection-stage diagnostics

Settings → Diagnostics records fixed stage names in the existing local, bounded log. Clear it before an attempt, connect once, then return to Diagnostics and copy/export the result. Entries are newest first; no log is sent automatically. The generic connection-failure UI remains unchanged.

An updated native/development app build from this branch is needed; the installed store build does not gain these diagnostics automatically. This change does not enable Linux controls, change authentication or bypass notification readiness.

| Code prefix | Operation |
| --- | --- |
| `ble_probe_connect` | Temporary GATT connection used during discovery |
| `ble_probe_services` | Service discovery for a status probe |
| `ble_status_read` | Discovery status-characteristic read |
| `ble_status_parse` | Decode and parse the status; empty or invalid status fails |
| `ble_selected_match` | Compare parsed status with the selected PC; `succeeded` or `not_matched` |
| `ble_resolution` | Find and prepare the selected connection; `started`, `succeeded`, `failed`, or `timed_out` |
| `ble_connect` | Connection to the selected device |
| `ble_priority` | Optional Android priority request; failure is nonfatal |
| `ble_mtu` | Android MTU negotiation |
| `ble_services` | Service discovery for the control connection |
| `ble_notifications` | Local notification listener registration, or a listener error |
| `ble_notification_ready` | Android CCCD read and enabled-value check |

Unless noted above, stages have `_started`, `_succeeded` and `_failed` outcomes. Listener registration success does not prove that the peripheral enabled notifications; Android checks its descriptor separately. Status-read success records a completed GATT read, not successful parsing. Scan probes can interleave; no device identifiers are included. Stop discovery and make one selected-device attempt for diagnosis.

Resolution spans both discovery and connection preparation, including priority, MTU and service setup. Its timeout is the overall deadline, not necessarily a missing device. A successful selected match means identity equality, not authentication or completed handoff. Nonmatching candidates are informational and normal when other PCs are nearby. A parse failure after a successful read distinguishes invalid/empty status from a native read failure, but does not expose the rejected value or parsing reason. Cancellation may leave only `ble_resolution_started`; stale operations do not report terminal outcomes into newer attempts.

The S26 beta.22 test showed successful reads but no priority/MTU/notification stages for the selected probe, while the Linux probe recorded no writes or notification channel. Its log had no explicit resolution outcome, so timeout and matching/parsing causes were not distinguishable. These new events require an updated app build; the test does not establish a root cause or completed Linux support.

Cancelled operations cannot later append success/failure into a newer operation. Unsubscribed notification callbacks cannot append stage diagnostics. Cancellation may leave a started entry without an outcome; that is not proof of Bluetooth failure. Native rejection and timeout both count as failure of the relevant stage. Raw errors/codes, addresses, PC names, descriptor values, payloads and credentials are never added to stage diagnostics.

## S26/Linux probe retest (pending)

Follow [physical-smoke-test.md](physical-smoke-test.md). Record exact Remote commit/build, phone model/Android version, probe commit and BlueZ version. Use the opt-in transport probe, which cannot approve pairing or inject input.

1. Install/run an authorized build containing these diagnostics. Keep the probe stopped until the phone is ready.
2. Clear Diagnostics, start the probe, scan, and confirm it appears. Discovery requires a valid status read.
3. Select it once. After failure, open Settings → Diagnostics and report the first failed connection stage in chronological order and preceding successes. Optional priority failure alone is not terminal.
4. Compare with probe RX counters and notification events. No RX/TX evidence plus `ble_notification_ready_failed` points to subscription/readiness, but does not distinguish a failed CCCD read from a disabled value. `ble_mtu_failed` points to negotiation instead.
5. Verify cancellation/back/background does not append stale outcomes. Check readable labels and copy/export with TalkBack and large text. No new automatic stage announcements or scan stops are added.

Do not claim a root cause or successful pairing from labels alone. Pairing failure is expected for the probe, but connection setup must be observed independently. Physical S26 validation remains pending until the updated app is installed and tested.
