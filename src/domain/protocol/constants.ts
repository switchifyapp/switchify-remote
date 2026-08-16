export const PROTOCOL_VERSION = 1;
export const FRAME_VERSION = 1;
export const DEFAULT_FRAME_PAYLOAD_BYTES = 160;
export const MAX_MESSAGE_BYTES = 16 * 1024;
export const PARTIAL_MESSAGE_TIMEOUT_MS = 10_000;

export const BLE_UUIDS = {
  service: '7a78f7e8-1d6d-4d92-9ef0-1f89d3db21f4',
  receive: '7a78f7e9-1d6d-4d92-9ef0-1f89d3db21f4',
  transmit: '7a78f7ea-1d6d-4d92-9ef0-1f89d3db21f4',
  status: '7a78f7eb-1d6d-4d92-9ef0-1f89d3db21f4',
} as const;
