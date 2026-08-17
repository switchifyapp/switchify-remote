import { toByteArray } from 'base64-js';
import { createFrames, encodeFrame, FrameReassembler } from '@/domain/protocol/framing';
import type { BleTransport, Unsubscribe } from '@/transport/BleTransport';
import { ProtocolClient } from './ProtocolClient';

class FakeTransport implements BleTransport {
  frames: string[] = [];
  listener: ((value: string) => void) | null = null;
  fail = false;
  writeGate: Promise<void> | null = null;
  inFlight = 0;
  maxInFlight = 0;
  availability = async () => 'ready' as const;
  maxWriteValueBytes = () => 182;
  scan(): Unsubscribe { return () => undefined; }
  connect = async () => undefined; disconnect = async () => undefined;
  cancelPendingWrites = async () => undefined;
  notificationsReady = async () => undefined;
  async writeFrame(frame: string) { if (this.fail) throw new Error('write failed'); this.inFlight += 1; this.maxInFlight = Math.max(this.maxInFlight, this.inFlight); await this.writeGate; this.frames.push(frame); this.inFlight -= 1; }
  subscribe(listener: (value: string) => void): Unsubscribe { this.listener = listener; return () => { this.listener = null; }; }
  subscribeDisconnect(): Unsubscribe { return () => undefined; }
  emit(response: object) { createFrames(JSON.stringify(response), 'response').forEach((frame) => this.listener?.(encodeFrame(frame))); }
}

describe('ProtocolClient', () => {
  it('serializes MTU-safe writes that reassemble to the original message', async () => {
    const transport = new FakeTransport();
    const client = new ProtocolClient(transport, () => 'message');
    const message = JSON.stringify({ text: 'safe fixture '.repeat(100) });
    await client.send(message);
    expect(Math.max(...transport.frames.map((frame) => toByteArray(frame).length))).toBeLessThanOrEqual(182);
    const reassembler = new FrameReassembler();
    let result: ReturnType<FrameReassembler['accept']> = { kind: 'incomplete' };
    for (const raw of transport.frames) {
      const frame = JSON.parse(new TextDecoder().decode(toByteArray(raw)));
      result = reassembler.accept(frame);
    }
    expect(result).toEqual({ kind: 'complete', message });
  });

  it('correlates only the requested response and ignores stale notifications', async () => {
    const transport = new FakeTransport();
    const client = new ProtocolClient(transport);
    await client.start(jest.fn());
    const request = client.request('{"fixture":true}', 'wanted');
    await Promise.resolve();
    transport.emit({ type: 'ack', id: 'stale', ok: true, error: null });
    transport.emit({ type: 'ack', id: 'wanted', ok: true, error: null });
    await expect(request).resolves.toEqual({ kind: 'ack', id: 'wanted' });
  });

  it('serializes concurrent GATT writes', async () => {
    const transport = new FakeTransport();
    let release!: () => void;
    transport.writeGate = new Promise<void>((resolve) => { release = resolve; });
    const client = new ProtocolClient(transport, (() => { let id = 0; return () => `message-${++id}`; })());
    const first = client.send('first');
    const second = client.send('second');
    await Promise.resolve(); await Promise.resolve();
    expect(transport.maxInFlight).toBe(1);
    release();
    await Promise.all([first, second]);
    expect(transport.maxInFlight).toBe(1);
  });

  it('rejects write failures and notification loss', async () => {
    const transport = new FakeTransport();
    transport.fail = true;
    const client = new ProtocolClient(transport);
    await expect(client.request('{"fixture":true}', 'write', 10)).rejects.toThrow('Could not write');
    transport.fail = false;
    await expect(client.request('{"fixture":true}', 'timeout', 1)).rejects.toThrow('timed out');
  });

  it('bounds a native GATT write that never settles', async () => {
    const transport = new FakeTransport();
    transport.writeGate = new Promise<void>(() => undefined);
    const client = new ProtocolClient(transport, () => 'hung-write', 1);
    await expect(client.send('never')).rejects.toThrow('write timed out');
  });
});
