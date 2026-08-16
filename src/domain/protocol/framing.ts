import { fromByteArray, toByteArray } from 'base64-js';

import { DEFAULT_FRAME_PAYLOAD_BYTES, FRAME_VERSION, MAX_MESSAGE_BYTES, PARTIAL_MESSAGE_TIMEOUT_MS } from './constants';

export type BluetoothFrame = { version: number; messageId: string; sequence: number; isFinal: boolean; totalBytes: number; payloadBase64: string };
export type ReassemblyResult = { kind: 'complete'; message: string } | { kind: 'incomplete' } | { kind: 'rejected'; reason: 'invalid_frame' | 'message_too_large' | 'expired' };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function createFrames(message: string, messageId: string, maxPayloadBytes = DEFAULT_FRAME_PAYLOAD_BYTES, maxMessageBytes = MAX_MESSAGE_BYTES): BluetoothFrame[] {
  if (maxPayloadBytes <= 0) throw new Error('Bluetooth frame payload size must be positive.');
  const bytes = encoder.encode(message);
  if (bytes.length > maxMessageBytes) throw new Error('Bluetooth message is too large.');
  const frames: BluetoothFrame[] = [];
  let offset = 0;
  let sequence = 0;
  do {
    const end = Math.min(offset + maxPayloadBytes, bytes.length);
    frames.push({ version: FRAME_VERSION, messageId, sequence, isFinal: end >= bytes.length, totalBytes: bytes.length, payloadBase64: fromByteArray(bytes.slice(offset, end)) });
    offset += maxPayloadBytes;
    sequence += 1;
  } while (offset < bytes.length);
  return frames;
}

export function encodeFrame(frame: BluetoothFrame): string {
  return fromByteArray(encoder.encode(JSON.stringify(frame)));
}

export function encodedFrameBytes(frame: BluetoothFrame): number {
  return toByteArray(encodeFrame(frame)).length;
}

export function createFramesForWriteLimit(message: string, messageId: string, maxWriteValueBytes: number): BluetoothFrame[] {
  const messageBytes = encoder.encode(message).length;
  let low = 1;
  let high = Math.max(1, Math.min(DEFAULT_FRAME_PAYLOAD_BYTES, messageBytes));
  let fitting: BluetoothFrame[] | null = null;
  while (low <= high) {
    const payloadBytes = Math.floor((low + high) / 2);
    const frames = createFrames(message, messageId, payloadBytes);
    if (frames.every((frame) => encodedFrameBytes(frame) <= maxWriteValueBytes)) {
      fitting = frames;
      low = payloadBytes + 1;
    } else {
      high = payloadBytes - 1;
    }
  }
  if (!fitting) throw new Error('Negotiated Bluetooth write size is too small for protocol frames.');
  return fitting;
}

export function decodeFrame(value: string): BluetoothFrame | null {
  try {
    const decoded = JSON.parse(decoder.decode(toByteArray(value))) as BluetoothFrame;
    return validateFrame(decoded) ? null : decoded;
  } catch {
    return null;
  }
}

export type FrameRejectReason = Extract<ReassemblyResult, { kind: 'rejected' }>['reason'];

export function validateFrame(frame: BluetoothFrame, maxMessageBytes = MAX_MESSAGE_BYTES): FrameRejectReason | null {
  if (frame.totalBytes > maxMessageBytes) return 'message_too_large';
  if (frame.version !== FRAME_VERSION || !frame.messageId || !Number.isInteger(frame.sequence) || frame.sequence < 0 || !Number.isInteger(frame.totalBytes) || frame.totalBytes < 0) return 'invalid_frame';
  try { toByteArray(frame.payloadBase64); } catch { return 'invalid_frame'; }
  return null;
}

type Partial = { totalBytes: number; createdAt: number; chunks: Map<number, Uint8Array>; finalSequence?: number };

export class FrameReassembler {
  readonly #partials = new Map<string, Partial>();
  constructor(private readonly now = Date.now, private readonly timeoutMs = PARTIAL_MESSAGE_TIMEOUT_MS, private readonly maxMessageBytes = MAX_MESSAGE_BYTES) {}

  accept(frame: BluetoothFrame): ReassemblyResult {
    const rejection = validateFrame(frame, this.maxMessageBytes);
    if (rejection) return { kind: 'rejected', reason: rejection };
    this.clearExpired();
    const partial: Partial = this.#partials.get(frame.messageId) ?? { totalBytes: frame.totalBytes, createdAt: this.now(), chunks: new Map<number, Uint8Array>() };
    if (partial.totalBytes !== frame.totalBytes) {
      this.#partials.delete(frame.messageId);
      return { kind: 'rejected', reason: 'invalid_frame' };
    }
    try { if (!partial.chunks.has(frame.sequence)) partial.chunks.set(frame.sequence, toByteArray(frame.payloadBase64)); } catch { return { kind: 'rejected', reason: 'invalid_frame' }; }
    if (frame.isFinal) partial.finalSequence = frame.sequence;
    this.#partials.set(frame.messageId, partial);
    if (partial.finalSequence === undefined) return { kind: 'incomplete' };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (let sequence = 0; sequence <= partial.finalSequence && partial.chunks.has(sequence); sequence += 1) {
      const chunk = partial.chunks.get(sequence)!;
      chunks.push(chunk);
      size += chunk.length;
      if (size > partial.totalBytes) { this.#partials.delete(frame.messageId); return { kind: 'rejected', reason: 'invalid_frame' }; }
    }
    if (size !== partial.totalBytes) return { kind: 'incomplete' };
    this.#partials.delete(frame.messageId);
    const combined = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
    return { kind: 'complete', message: decoder.decode(combined) };
  }

  clearExpired(): number {
    const deadline = this.now() - this.timeoutMs;
    let count = 0;
    for (const [id, partial] of this.#partials) if (partial.createdAt <= deadline) { this.#partials.delete(id); count += 1; }
    return count;
  }

  clear(): void { this.#partials.clear(); }
}
