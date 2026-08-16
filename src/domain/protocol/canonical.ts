import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { fromByteArray } from 'base64-js';

import { PROTOCOL_VERSION } from './constants';
import type { JsonValue, ResponseMode } from './types';

export function stableStringify(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key] ?? null)}`).join(',')}}`;
}

export function authProof(input: {
  id: string;
  deviceId: string;
  timestamp: number;
  type: string;
  payload: JsonValue;
  token: string;
  responseMode?: ResponseMode;
}): string {
  const canonical = [PROTOCOL_VERSION, input.id, input.deviceId, input.timestamp, input.type, stableStringify(input.payload), input.responseMode ?? 'ack'].join('\n');
  return fromByteArray(hmac(sha256, utf8ToBytes(input.token), utf8ToBytes(canonical)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
