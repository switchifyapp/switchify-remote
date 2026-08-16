import * as Crypto from 'expo-crypto';

import { createFramesForWriteLimit, decodeFrame, encodeFrame, FrameReassembler } from '@/domain/protocol/framing';
import { parseResponse } from '@/domain/protocol/responses';
import type { ProtocolResponse } from '@/domain/protocol/types';
import type { BleTransport, Unsubscribe } from '@/transport/BleTransport';

export class ProtocolClient {
  readonly #reassembler = new FrameReassembler();
  readonly #pending = new Map<string, { resolve: (response: ProtocolResponse) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  #writeQueue = Promise.resolve();
  #unsubscribe: Unsubscribe | null = null;

  constructor(private readonly transport: BleTransport, private readonly messageId = () => Crypto.randomUUID()) {}

  start(onFailure: () => void): void {
    this.#unsubscribe?.();
    this.#unsubscribe = this.transport.subscribe((raw) => this.#accept(raw), () => { this.close(); onFailure(); });
  }

  async request(message: string, requestId: string, timeoutMs = 10_000): Promise<ProtocolResponse> {
    const response = new Promise<ProtocolResponse>((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending.delete(requestId); reject(new Error('PC response timed out.')); }, timeoutMs);
      this.#pending.set(requestId, { resolve, reject, timer });
    });
    try { await this.send(message); }
    catch { this.#reject(requestId, new Error('Could not write to PC.')); }
    return response;
  }

  async send(message: string): Promise<void> {
    const frames = createFramesForWriteLimit(message, this.messageId(), this.transport.maxWriteValueBytes());
    for (const frame of frames) {
      const write = this.#writeQueue.catch(() => undefined).then(() => this.transport.writeFrame(encodeFrame(frame)));
      this.#writeQueue = write;
      await write;
    }
  }

  close(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#reassembler.clear();
    this.cancelPending();
  }

  cancelPending(): void {
    for (const id of [...this.#pending.keys()]) this.#reject(id, new Error('PC disconnected.'));
  }

  #accept(raw: string): void {
    const frame = decodeFrame(raw);
    if (!frame) return;
    const result = this.#reassembler.accept(frame);
    if (result.kind !== 'complete') return;
    const response = parseResponse(result.message);
    if (response.kind === 'invalid') return;
    const id = response.id;
    if (id) {
      const pending = this.#pending.get(id);
      if (pending) { clearTimeout(pending.timer); this.#pending.delete(id); pending.resolve(response); }
    }
  }

  #reject(id: string, error: Error): void {
    const pending = this.#pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.#pending.delete(id);
    pending.reject(error);
  }
}
