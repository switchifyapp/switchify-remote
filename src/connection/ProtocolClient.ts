import * as Crypto from 'expo-crypto';

import { createFramesForWriteLimit, decodeFrame, encodeFrame, FrameReassembler } from '@/domain/protocol/framing';
import { parseResponse } from '@/domain/protocol/responses';
import type { ProtocolResponse } from '@/domain/protocol/types';
import type { BleTransport, Unsubscribe } from '@/transport/BleTransport';

export class ProtocolClient {
  readonly #reassembler = new FrameReassembler();
  readonly #pending = new Map<string, { resolve: (response: ProtocolResponse) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> | null }>();
  readonly #writeCancels = new Set<(error: Error) => void>();
  #writeQueue = Promise.resolve();
  #unsubscribe: Unsubscribe | null = null;

  constructor(private readonly transport: BleTransport, private readonly messageId = () => Crypto.randomUUID(), private readonly writeTimeoutMs = 5_000) {}

  async start(onFailure: () => void): Promise<void> {
    this.#unsubscribe?.();
    this.#unsubscribe = this.transport.subscribe((raw) => this.#accept(raw), () => { void this.close().finally(onFailure); });
    try {
      await this.transport.notificationsReady();
    } catch (error) {
      this.#unsubscribe?.();
      this.#unsubscribe = null;
      throw error;
    }
  }

  async request(message: string, requestId: string, timeoutMs = 10_000): Promise<ProtocolResponse> {
    const response = new Promise<ProtocolResponse>((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject, timer: null });
    });
    void response.catch(() => undefined);
    try { await this.send(message); }
    catch { this.#reject(requestId, new Error('Could not write to PC.')); }
    const pending = this.#pending.get(requestId);
    if (pending) pending.timer = setTimeout(() => { this.#pending.delete(requestId); pending.reject(new Error('PC response timed out.')); }, timeoutMs);
    return await response;
  }

  async send(message: string): Promise<void> {
    const frames = createFramesForWriteLimit(message, this.messageId(), this.transport.maxWriteValueBytes());
    for (const frame of frames) {
      const write = this.#writeQueue.catch(() => undefined).then(() => this.#write(encodeFrame(frame)));
      this.#writeQueue = write;
      await write;
    }
  }

  async close(): Promise<void> {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#reassembler.clear();
    await this.cancelOutstanding();
  }

  cancelPending(): void {
    for (const id of [...this.#pending.keys()]) this.#reject(id, new Error('PC disconnected.'));
  }

  async cancelOutstanding(): Promise<void> {
    this.cancelPending();
    const error = new Error('PC disconnected.');
    await this.transport.cancelPendingWrites();
    for (const cancel of [...this.#writeCancels]) cancel(error);
    this.#writeQueue = Promise.resolve();
  }

  #write(frame: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;
      const finish = (result: 'resolve' | 'reject', error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.#writeCancels.delete(cancel);
        if (result === 'resolve') resolve(); else reject(error ?? new Error('Could not write to PC.'));
      };
      const cancel = (error: Error) => finish('reject', error);
      timer = setTimeout(() => { void this.transport.cancelPendingWrites().finally(() => cancel(new Error('Bluetooth write timed out.'))); }, this.writeTimeoutMs);
      this.#writeCancels.add(cancel);
      void this.transport.writeFrame(frame).then(() => finish('resolve'), () => finish('reject'));
    });
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
      if (pending) { if (pending.timer) clearTimeout(pending.timer); this.#pending.delete(id); pending.resolve(response); }
    }
  }

  #reject(id: string, error: Error): void {
    const pending = this.#pending.get(id);
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    this.#pending.delete(id);
    pending.reject(error);
  }
}
