import { authenticatedCommand } from '@/domain/protocol/commands';
import { createFrames, decodeFrame, encodeFrame, FrameReassembler } from '@/domain/protocol/framing';
import { toByteArray } from 'base64-js';
import { DiagnosticLog } from '@/diagnostics/DiagnosticLog';
import type { PairingStorage, SavedPc } from '@/storage/PairingStore';
import type { BleTransport, DiscoveredDesktop, Unsubscribe } from '@/transport/BleTransport';
import { ConnectionManager } from './ConnectionManager';
import { RemoteSession } from '@/remote/RemoteSession';

class MemoryStorage implements PairingStorage {
  saved: SavedPc[] = [];
  tokens = new Map<string, string>();
  defaultId: string | null = null;
  failRemove = false;
  getDeviceId = async () => 'device-1'; list = async () => this.saved; token = async (id: string) => this.tokens.get(id) ?? null;
  save = async (pc: SavedPc, token: string) => { this.saved = [pc]; this.tokens.set(pc.desktopId, token); };
  remove = async (id: string) => { if (this.failRemove) throw new Error('remove failed'); this.saved = this.saved.filter((pc) => pc.desktopId !== id); this.tokens.delete(id); };
  defaultDesktopId = async () => this.defaultId; setDefaultDesktopId = async (id: string | null) => { this.defaultId = id; };
}

class LoopbackTransport implements BleTransport {
  availability = async () => 'ready' as const;
  maxWriteValueBytes = () => 182;
  readonly outbound = new FrameReassembler();
  onFrame: ((frame: string) => void) | null = null;
  onDisconnect: (() => void) | null = null;
  failWrites = false;
  rejectPairing = false;
  rejectAuthentication = false;
  requests: string[] = [];
  connectCount = 0;
  connectFailures = 0;
  readinessGate: Promise<void> | null = null;
  responseGates = new Map<string, Promise<void>>();
  dropResponses = new Set<string>();
  hangWrites = new Set<string>();
  scan(): Unsubscribe { return () => undefined; }
  resolveAndConnect = async () => {
    this.connectCount += 1;
    if (this.connectFailures > 0) { this.connectFailures -= 1; throw new Error('connect failed'); }
    return desktop;
  };
  connect = async () => undefined;
  disconnect = async () => undefined;
  cancelPendingWrites = async () => undefined;
  notificationsReady = async () => { await this.readinessGate; };
  subscribe(onFrame: (frameBase64: string) => void): Unsubscribe { this.onFrame = onFrame; return () => { this.onFrame = null; }; }
  subscribeDisconnect(onDisconnect: () => void): Unsubscribe { this.onDisconnect = onDisconnect; return () => { this.onDisconnect = null; }; }
  async writeFrame(raw: string): Promise<void> {
    if (this.failWrites) throw new Error('fixture write failed');
    if (toByteArray(raw).length > this.maxWriteValueBytes()) throw new Error('fixture frame exceeded MTU');
    const frame = decodeFrame(raw);
    if (!frame) throw new Error('invalid fixture frame');
    const result = this.outbound.accept(frame);
    if (result.kind !== 'complete') return;
    const request = JSON.parse(result.message) as { id: string; type: string; payload: { deviceId?: string; desktopId?: string } };
    this.requests.push(request.type);
    if (this.hangWrites.has(request.type)) await new Promise<void>(() => undefined);
    await this.responseGates.get(request.type);
    if (this.dropResponses.has(request.type)) return;
    let response: object;
    if (request.type === 'pairing.request') {
      response = this.rejectPairing
        ? { type: 'error', id: request.id, error: { code: 'pairing_rejected', message: 'pairing_rejected' } }
        : { type: 'pairing.complete', id: request.id, ok: true, error: null, payload: { desktopId: request.payload.desktopId, deviceId: request.payload.deviceId, token: 'fixture-secret' } };
    } else if (request.type === 'connection.ping' && this.rejectAuthentication) {
      response = { type: 'error', id: request.id, ok: false, error: { code: 'invalid_auth', message: 'invalid_auth' }, payload: {} };
    } else if (request.type === 'pointer.profile') {
      response = { type: 'pointer.profile', id: request.id, ok: true, error: null, payload: {
        displayId: 'display-1', scaleFactor: 1.5, bounds: { x: -1280, y: 0, width: 1280, height: 720 }, maxDelta: 256,
        recommendedDeltas: { small: 32, medium: 128, large: 256 }, capabilities: { noAckMouseMove: true, noAckCommands: ['mouse.move'], supportedCommands: ['mouse.move', 'mouse.click', 'pointer.display.move', 'pointer.speed.set', 'keyboard.typeText', 'keyboard.textStream.open', 'keyboard.textStream.chunk', 'keyboard.textStream.key', 'keyboard.textStream.close'], mouseRepeat: { supported: true, enabled: true, intervalMs: 250, minIntervalMs: 100, maxIntervalMs: 2000 }, pointerSpeed: { supported: true, setSupported: true, scalePercent: 100, minScalePercent: 5, maxScalePercent: 225, stepPercent: 5, baseMoveDelta: 128, effectiveMoveDelta: 128 }, displayNavigation: { supported: true, displayCount: 2 } },
      } };
    } else response = { type: 'ack', id: request.id, ok: true, error: null };
    queueMicrotask(() => createFrames(JSON.stringify(response), `response-${request.id}`).forEach((item) => this.onFrame?.(encodeFrame(item))));
  }
}

const desktop: DiscoveredDesktop = { desktopId: 'pc-1', displayName: 'Office', platform: 'windows', peripheralId: 'ble-1', rssi: -45 };

describe('pairing and authenticated connection integration', () => {
  it('pairs, persists, negotiates capabilities, sends a command, and cleans up', async () => {
    const transport = new LoopbackTransport();
    const storage = new MemoryStorage();
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true, () => 1000, (() => { let id = 0; return () => `request-${++id}`; })());
    const cleanup = jest.fn(async () => {
      expect(await manager.send('mouse.click', { button: 'left' })).toBe(true);
    });
    manager.registerCleanup(cleanup);
    await manager.connect(desktop);
    expect(manager.snapshot()).toMatchObject({ kind: 'connected', profile: { scaleFactor: 1.5, capabilities: { displayNavigation: { displayCount: 2 } } } });
    expect(storage.tokens.get('pc-1')).toBe('fixture-secret');
    expect(await manager.send('mouse.click', { button: 'left' })).toBe(true);
    await manager.disconnect();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(transport.requests.filter((type) => type === 'mouse.click')).toHaveLength(2);
    expect(manager.snapshot().kind).toBe('idle');
  });

  it('does not send pairing until notifications are ready', async () => {
    let ready!: () => void;
    const transport = new LoopbackTransport();
    transport.readinessGate = new Promise<void>((resolve) => { ready = resolve; });
    const manager = new ConnectionManager(transport, new MemoryStorage(), new DiagnosticLog(), async () => true, () => 1000, () => 'request-ready');
    const connecting = manager.connect(desktop);
    await Promise.resolve();
    await Promise.resolve();
    expect(transport.requests).toEqual([]);
    ready();
    await connecting;
    expect(transport.requests[0]).toBe('pairing.request');
    expect(manager.snapshot().kind).toBe('connected');
  });

  it('authenticates a discovered saved PC without sending another pairing request', async () => {
    const transport = new LoopbackTransport();
    const storage = new MemoryStorage();
    storage.saved = [{ ...desktop, lastConnectedAt: 1 }];
    storage.tokens.set(desktop.desktopId, 'fixture-secret');
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true, () => 1000, (() => { let id = 0; return () => `saved-${++id}`; })());

    await manager.connect(desktop);

    expect(manager.snapshot().kind).toBe('connected');
    expect(transport.requests).toContain('connection.ping');
    expect(transport.requests).not.toContain('pairing.request');
  });

  it('keeps an established preferred connection when Remote loses focus', async () => {
    const transport = new LoopbackTransport();
    const storage = new MemoryStorage();
    storage.saved = [{ ...desktop, lastConnectedAt: 1 }];
    storage.tokens.set(desktop.desktopId, 'fixture-secret');
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true, () => 1000, (() => { let id = 0; return () => `preferred-${++id}`; })());

    await manager.connectPreferred();
    expect(manager.snapshot().kind).toBe('connected');

    await manager.cancelPreferredConnection();

    expect(manager.snapshot().kind).toBe('connected');
    expect(await manager.send('mouse.click', { button: 'left' })).toBe(true);
  });

  it('invalidates rejected saved access without silently reopening pairing', async () => {
    const transport = new LoopbackTransport();
    transport.rejectAuthentication = true;
    const storage = new MemoryStorage();
    storage.saved = [{ ...desktop, lastConnectedAt: 1 }];
    storage.tokens.set(desktop.desktopId, 'expired-secret');
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true, () => 1000, (() => { let id = 0; return () => `expired-${++id}`; })());

    await manager.connectSaved(storage.saved[0]!);

    expect(transport.requests).toEqual(['connection.ping']);
    expect(storage.saved).toEqual([]);
    expect(manager.snapshot()).toMatchObject({ kind: 'failed', message: 'Saved access is no longer valid. Request access again.' });
  });

  it('forces Request access pairing after invalid-token cleanup fails', async () => {
    const transport = new LoopbackTransport();
    transport.rejectAuthentication = true;
    const storage = new MemoryStorage();
    storage.saved = [{ ...desktop, lastConnectedAt: 1 }];
    storage.tokens.set(desktop.desktopId, 'expired-secret');
    storage.failRemove = true;
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true, () => 1000, (() => { let id = 0; return () => `cleanup-failure-${++id}`; })());

    await manager.connectSaved(storage.saved[0]!);
    expect(manager.snapshot()).toMatchObject({ kind: 'failed', saved: [] });

    storage.failRemove = false;
    transport.rejectAuthentication = false;
    await manager.connect(desktop);
    expect(transport.requests).toContain('pairing.request');
    expect(manager.snapshot().kind).toBe('connected');
  });

  it('returns a sanitized failed state for rejection and write failure', async () => {
    const rejected = new LoopbackTransport();
    rejected.rejectPairing = true;
    const manager = new ConnectionManager(rejected, new MemoryStorage(), new DiagnosticLog(), async () => true, () => 1000, () => 'request-1');
    await manager.connect(desktop);
    expect(manager.snapshot()).toMatchObject({ kind: 'failed', message: 'Could not connect to this PC.' });

    const broken = new LoopbackTransport();
    broken.failWrites = true;
    const failed = new ConnectionManager(broken, new MemoryStorage(), new DiagnosticLog(), async () => true, () => 1000, () => 'request-2');
    await failed.connect(desktop);
    expect(failed.snapshot()).toMatchObject({ kind: 'failed', message: 'Could not connect to this PC.' });
  });

  it('does not include authenticated secrets in serialized command bodies', () => {
    const command = authenticatedCommand({ id: 'request', deviceId: 'device', token: 'fixture-secret', timestamp: 1000, type: 'connection.ping' });
    expect(command).not.toContain('fixture-secret');
  });

  it('reconnects in the foreground with the saved token', async () => {
    const transport = new LoopbackTransport();
    const manager = new ConnectionManager(transport, new MemoryStorage(), new DiagnosticLog(), async () => true, () => 1000, (() => { let id = 0; return () => `reconnect-${++id}`; })(), async () => undefined);
    await manager.connect(desktop);
    transport.onDisconnect?.();
    await waitFor(() => manager.snapshot().kind === 'connected' && transport.connectCount === 2);
    expect(transport.requests.filter((type) => type === 'connection.ping')).toHaveLength(2);
  });

  it('fails after bounded reconnect attempts and cancels retries on disconnect', async () => {
    const exhaustedTransport = new LoopbackTransport();
    const exhausted = new ConnectionManager(exhaustedTransport, new MemoryStorage(), new DiagnosticLog(), async () => true, () => 1000, (() => { let id = 0; return () => `exhaust-${++id}`; })(), async () => undefined);
    await exhausted.connect(desktop);
    exhaustedTransport.connectFailures = 3;
    exhaustedTransport.onDisconnect?.();
    await waitFor(() => exhausted.snapshot().kind === 'failed');
    expect(exhaustedTransport.connectCount).toBe(4);

    let resume!: () => void;
    const delayedTransport = new LoopbackTransport();
    const delayed = new ConnectionManager(delayedTransport, new MemoryStorage(), new DiagnosticLog(), async () => true, () => 1000, (() => { let id = 0; return () => `cancel-${++id}`; })(), () => new Promise<void>((resolve) => { resume = resolve; }));
    await delayed.connect(desktop);
    delayedTransport.onDisconnect?.();
    await waitFor(() => delayed.snapshot().kind === 'reconnecting');
    const disconnect = delayed.disconnect();
    resume();
    await disconnect;
    await Promise.resolve();
    expect(delayed.snapshot().kind).toBe('idle');
    expect(delayedTransport.connectCount).toBe(1);
  });

  it('cancels a blocked stream request before foreground cleanup writes', async () => {
    const transport = new LoopbackTransport();
    const manager = new ConnectionManager(transport, new MemoryStorage(), new DiagnosticLog(), async () => true, () => 1000, (() => { let id = 0; return () => `cleanup-${++id}`; })());
    await manager.connect(desktop);
    const connected = manager.snapshot();
    if (connected.kind !== 'connected') throw new Error('fixture did not connect');
    const session = new RemoteSession(manager, connected.profile, () => 'stream-1');
    manager.registerCleanup(() => session.cleanup());
    expect(await session.streamChunk('first')).toBe(true);
    transport.dropResponses.add('keyboard.textStream.chunk');
    const blocked = session.streamChunk('second');
    await waitFor(() => transport.requests.filter((type) => type === 'keyboard.textStream.chunk').length === 2);
    await manager.disconnect();
    await expect(blocked).resolves.toBe(false);
    expect(transport.requests).toContain('keyboard.textStream.close');
    expect(manager.snapshot().kind).toBe('idle');
  });

  it('disconnects when a native command write never settles', async () => {
    const transport = new LoopbackTransport();
    const manager = new ConnectionManager(transport, new MemoryStorage(), new DiagnosticLog(), async () => true, () => 1000, (() => { let id = 0; return () => `hung-${++id}`; })());
    await manager.connect(desktop);
    transport.hangWrites.add('mouse.click');
    const blocked = manager.send('mouse.click', { button: 'left' });
    await waitFor(() => transport.requests.filter((type) => type === 'mouse.click').length === 1);
    await manager.disconnect();
    await expect(blocked).resolves.toBe(false);
    expect(manager.snapshot().kind).toBe('idle');
  });

  it.each(['pairing.request', 'connection.ping', 'pointer.profile'])('keeps explicit disconnect authoritative while %s is pending', async (pendingType) => {
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    const transport = new LoopbackTransport();
    transport.responseGates.set(pendingType, gate);
    const storage = new MemoryStorage();
    if (pendingType !== 'pairing.request') {
      storage.saved = [{ desktopId: desktop.desktopId, displayName: desktop.displayName, platform: desktop.platform, peripheralId: desktop.peripheralId, lastConnectedAt: 1 }];
      storage.tokens.set(desktop.desktopId, 'fixture-secret');
    }
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true, () => 1000, (() => { let id = 0; return () => `race-${++id}`; })());
    const connecting = manager.connect(desktop);
    await waitFor(() => transport.requests.includes(pendingType));
    const disconnecting = manager.disconnect();
    resume();
    await Promise.all([connecting, disconnecting]);
    expect(manager.snapshot().kind).toBe('idle');
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('condition was not reached');
}
