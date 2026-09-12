import { DiagnosticLog, type DiagnosticAttempt } from '@/diagnostics/DiagnosticLog';
import type { PairingStorage, SavedPc } from '@/storage/PairingStore';
import type { BleAvailability, BleTransport, DiscoveredDesktop, Unsubscribe } from '@/transport/BleTransport';
import { ConnectionManager } from './ConnectionManager';
import { pairingVerificationCode } from './verificationCode';

class FakeStorage implements PairingStorage {
  saved: SavedPc[] = [];
  tokens = new Map<string, string>();
  defaultId: string | null = null;
  failRemove = false;
  failTokenRead = false;
  listGate: Promise<void> | null = null;
  getDeviceId = async () => 'device-1'; list = async () => { await this.listGate; return this.saved; }; token = async (id: string) => { if (this.failTokenRead) throw new Error('secure read failed'); return this.tokens.get(id) ?? null; };
  save = async (pc: SavedPc, token: string) => { this.saved = [pc]; this.tokens.set(pc.desktopId, token); };
  remove = async (id: string) => { if (this.failRemove) throw new Error('remove failed'); this.saved = this.saved.filter((pc) => pc.desktopId !== id); this.tokens.delete(id); };
  defaultDesktopId = async () => this.defaultId; setDefaultDesktopId = async (id: string | null) => { this.defaultId = id; };
}

class FakeTransport implements BleTransport {
  currentAvailability: BleAvailability = 'ready';
  availability = async () => this.currentAvailability;
  maxWriteValueBytes = () => 182;
  scanCallback: ((pc: DiscoveredDesktop) => void) | null = null;
  scanStops = 0;
  connectedPeripheralIds: string[] = [];
  resolvedDesktop: DiscoveredDesktop | null = null;
  resolveError: Error | null = null;
  resolveGate: Promise<void> | null = null;
  resolveGates = new Map<string, Promise<void>>();
  resolveDesktopIds: string[] = [];
  attempts: DiagnosticAttempt[] = [];
  resolveStarted: ((desktopId: string) => void) | null = null;
  failConnect = false;
  failReadiness = false;
  connectGate: Promise<void> | null = null;
  scan(onDesktop: (desktop: DiscoveredDesktop) => void): Unsubscribe {
    this.scanCallback = onDesktop;
    return () => { this.scanStops += 1; this.scanCallback = null; };
  }
  connect = async (peripheralId: string) => {
    this.connectedPeripheralIds.push(peripheralId);
    await this.connectGate;
    if (this.failConnect) throw new Error('connect failed');
  }; disconnect = async () => undefined; writeFrame = async () => undefined;
  resolveAndConnect = async (desktopId: string, attempt?: DiagnosticAttempt) => {
    if (attempt) this.attempts.push(attempt);
    this.resolveDesktopIds.push(desktopId);
    this.resolveStarted?.(desktopId);
    await (this.resolveGates.get(desktopId) ?? this.resolveGate);
    if (this.resolveError) throw this.resolveError;
    if (!this.resolvedDesktop) throw new Error('not found');
    return this.resolvedDesktop;
  };
  cancelPendingWrites = async () => undefined;
  verifyConnection = async () => true;
  notificationsReady = async () => { if (this.failReadiness) throw new Error('readiness failed'); };
  subscribe(): Unsubscribe { return () => undefined; } subscribeDisconnect(): Unsubscribe { return () => undefined; }
}

const pc = (id: string, lastConnectedAt = 1): SavedPc => ({ desktopId: id, displayName: id, platform: 'windows', peripheralId: `ble-${id}`, lastConnectedAt });

const waitFor = async (condition: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 20 && !condition(); attempt += 1) await Promise.resolve();
  expect(condition()).toBe(true);
};

describe('connection lifecycle', () => {
  it('keeps overlapping manual attempts separate and ignores late completion', async () => {
    const storage = new FakeStorage();
    storage.saved = [pc('private-first'), pc('private-second')];
    storage.saved.forEach((p) => storage.tokens.set(p.desktopId, 'private-token'));
    const transport = new FakeTransport();
    let release!: () => void;
    transport.resolveGates.set('private-first', new Promise<void>((resolve) => { release = resolve; }));
    transport.resolveError = new Error('private native error');
    const log = new DiagnosticLog();
    const manager = new ConnectionManager(transport, storage, log, async () => true);
    const first = manager.connectSaved(storage.saved[0]!);
    await waitFor(() => transport.resolveDesktopIds.length === 1);
    await manager.connectSaved(storage.saved[1]!);
    const completed = log.export();
    release();
    await first;
    expect(log.export()).toBe(completed);
    expect(transport.attempts).toMatchObject([{ attempt: 1, pc: 1, source: 'saved' }, { attempt: 2, pc: 2, source: 'saved' }]);
    expect(completed).toContain('[attempt-1 PC-1 saved] A new connection request');
    expect(completed).toContain('[attempt-2 PC-2 saved] Connection attempt failed');
    expect(completed).not.toContain('private');
  });

  it('does not let preferred auto-connect replace a pending manual target', async () => {
    const storage = new FakeStorage();
    storage.saved = [pc('preferred-private'), pc('manual-private')];
    storage.saved.forEach((p) => storage.tokens.set(p.desktopId, 'private-token'));
    const transport = new FakeTransport();
    let release!: () => void;
    transport.resolveGate = new Promise<void>((resolve) => { release = resolve; });
    transport.resolveError = new Error('private error');
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true);
    const manual = manager.connectSaved(storage.saved[1]!);
    await waitFor(() => transport.resolveDesktopIds.length === 1);
    await manager.connectPreferred();
    expect(transport.resolveDesktopIds).toEqual(['manual-private']);
    release();
    await manual;
  });

  it('distinguishes automatic preferred requests from explicit switches', async () => {
    const storage = new FakeStorage();
    storage.saved = [pc('preferred-private'), pc('switched-private')];
    storage.saved.forEach((p) => storage.tokens.set(p.desktopId, 'private-token'));
    const transport = new FakeTransport();
    transport.resolveError = new Error('private error');
    const log = new DiagnosticLog();
    const manager = new ConnectionManager(transport, storage, log, async () => true);
    await manager.connectPreferred();
    await manager.switchSaved(storage.saved[1]!);
    expect(transport.attempts).toMatchObject([{ source: 'preferred', pc: 1 }, { source: 'switch', pc: 2 }]);
    expect(log.export()).toContain('teardown_switch');
    expect(log.export()).not.toContain('private');
  });

  it('does not cancel a manual replacement when an older preferred attempt loses focus', async () => {
    const storage = new FakeStorage();
    storage.saved = [pc('preferred-private'), pc('manual-private')];
    storage.saved.forEach((p) => storage.tokens.set(p.desktopId, 'private-token'));
    const transport = new FakeTransport();
    let releasePreferred!: () => void;
    let releaseManual!: () => void;
    transport.resolveGates.set('preferred-private', new Promise<void>((resolve) => { releasePreferred = resolve; }));
    transport.resolveGates.set('manual-private', new Promise<void>((resolve) => { releaseManual = resolve; }));
    transport.resolveError = new Error('private error');
    const log = new DiagnosticLog();
    const manager = new ConnectionManager(transport, storage, log, async () => true);
    const preferred = manager.connectPreferred();
    await waitFor(() => transport.resolveDesktopIds.length === 1);
    const manual = manager.connectSaved(storage.saved[1]!);
    await waitFor(() => transport.resolveDesktopIds.length === 2);
    await manager.cancelPreferredConnection();
    const state = manager.snapshot();
    releasePreferred(); releaseManual();
    await Promise.all([preferred, manual]);
    expect(state).toMatchObject({ kind: 'connecting', desktop: { desktopId: 'manual-private' } });
    expect(log.snapshot().some((entry) => entry.code === 'teardown_focus')).toBe(false);
  });
  it('matches the Android pairing verification algorithm', () => {
    expect(pairingVerificationCode('desktop-1', 'device-1', 'nonce-1')).toBe('215918');
    expect(pairingVerificationCode('0:0:1280:720:1.5', 'android-device-id', 'random-request-nonce')).toBe('735258');
    expect(pairingVerificationCode('desktop', 'device', 'nonce-14')).toBe('028314');
  });

  it('discovers PCs through an injectable fake without hardware', async () => {
    const transport = new FakeTransport();
    const manager = new ConnectionManager(transport, new FakeStorage(), new DiagnosticLog(), async () => true);
    await manager.scan();
    transport.scanCallback?.({ desktopId: 'pc-1', displayName: 'Office', platform: 'windows', peripheralId: 'ble-1', rssi: -50 });
    expect(manager.snapshot()).toMatchObject({ kind: 'scanning', discovered: [{ desktopId: 'pc-1', displayName: 'Office' }] });
  });

  it.each([['unauthorized', 'permissionDenied'], ['poweredOff', 'bluetoothOff'], ['unsupported', 'unsupported']] as const)('maps %s adapter state to %s', async (availability, expected) => {
    const transport = new FakeTransport();
    transport.currentAvailability = availability;
    const manager = new ConnectionManager(transport, new FakeStorage(), new DiagnosticLog(), async () => true);
    await manager.scan();
    expect(manager.snapshot().kind).toBe(expected);
  });

  it('keeps Android permission denial outside the transport', async () => {
    const manager = new ConnectionManager(new FakeTransport(), new FakeStorage(), new DiagnosticLog(), async () => false);
    await manager.scan();
    expect(manager.snapshot().kind).toBe('permissionDenied');
  });

  it('orders the selected default before more recently connected PCs', async () => {
    const storage = new FakeStorage();
    storage.saved = [pc('recent', 2), pc('default', 1)];
    storage.defaultId = 'default';
    const manager = new ConnectionManager(new FakeTransport(), storage, new DiagnosticLog(), async () => true);
    await manager.load();
    expect((manager.snapshot() as { saved: SavedPc[] }).saved.map(({ desktopId }) => desktopId)).toEqual(['default', 'recent']);
    await manager.setDefaultDesktopId('recent');
    expect((manager.snapshot() as { saved: SavedPc[] }).saved.map(({ desktopId }) => desktopId)).toEqual(['recent', 'default']);
  });

  it('surfaces a sanitized unpair failure without hiding the saved PC', async () => {
    const storage = new FakeStorage();
    storage.saved = [pc('pc-1')];
    storage.failRemove = true;
    const manager = new ConnectionManager(new FakeTransport(), storage, new DiagnosticLog(), async () => true);
    expect(await manager.unpair('pc-1')).toBe(false);
    expect(manager.snapshot()).toMatchObject({ kind: 'failed', message: 'Could not remove this saved PC.', saved: [{ desktopId: 'pc-1' }] });
  });

  it('does not let a stale native connect overwrite explicit disconnect', async () => {
    let release!: () => void;
    const transport = new FakeTransport();
    transport.resolveGate = new Promise<void>((resolve) => { release = resolve; });
    transport.resolvedDesktop = { ...pc('pc-1'), rssi: null };
    const manager = new ConnectionManager(transport, new FakeStorage(), new DiagnosticLog(), async () => true);
    const connecting = manager.connect({ ...pc('pc-1'), rssi: null });
    await Promise.resolve();
    const disconnecting = manager.disconnect();
    release();
    await Promise.all([connecting, disconnecting]);
    expect(manager.snapshot().kind).toBe('idle');
  });

  it('re-resolves a discovered PC and authenticates on the retained GATT connection', async () => {
    const transport = new FakeTransport();
    const discovered = { ...pc('pc-1'), peripheralId: 'probed-address', rssi: -50 };
    transport.resolvedDesktop = { ...discovered, peripheralId: 'fresh-address', rssi: -42 };
    transport.failReadiness = true;
    const manager = new ConnectionManager(transport, new FakeStorage(), new DiagnosticLog(), async () => true);

    await manager.connect(discovered);

    expect(transport.resolveDesktopIds).toEqual(['pc-1']);
    expect(transport.connectedPeripheralIds).toEqual([]);
    expect(manager.snapshot()).toMatchObject({ kind: 'failed', message: 'Could not connect to this PC.' });
  });

  it('resolves a saved PC by stable desktop ID before connecting to its rotating BLE address', async () => {
    const storage = new FakeStorage();
    const saved = { ...pc('pc-1'), peripheralId: 'old-private-address' };
    storage.saved = [saved];
    storage.tokens.set(saved.desktopId, 'saved-token');
    const transport = new FakeTransport();
    transport.resolvedDesktop = { ...saved, peripheralId: 'current-private-address', rssi: -42 };
    transport.failReadiness = true;
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true);

    await manager.connectSaved(saved);

    expect(transport.resolveDesktopIds).toEqual(['pc-1']);
    expect(transport.connectedPeripheralIds).toEqual([]);
    expect(transport.connectedPeripheralIds).not.toContain('old-private-address');
  });

  it('cancels saved-PC rediscovery without trying the stale address', async () => {
    const storage = new FakeStorage();
    const saved = { ...pc('pc-1'), peripheralId: 'old-private-address' };
    storage.saved = [saved];
    storage.tokens.set(saved.desktopId, 'saved-token');
    const transport = new FakeTransport();
    let release!: () => void;
    transport.resolveGate = new Promise<void>((resolve) => { release = resolve; });
    transport.resolvedDesktop = { ...saved, peripheralId: 'current-private-address', rssi: -42 };
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true);

    const connecting = manager.connectSaved(saved);
    await waitFor(() => transport.resolveDesktopIds.length === 1);
    const disconnecting = manager.disconnect();
    release();
    await Promise.all([connecting, disconnecting]);

    expect(transport.connectedPeripheralIds).toEqual([]);
    expect(manager.snapshot().kind).toBe('idle');
  });

  it('surfaces a sanitized failure when saved-PC discovery times out', async () => {
    const storage = new FakeStorage();
    const saved = { ...pc('pc-1'), peripheralId: 'old-private-address' };
    storage.saved = [saved];
    storage.tokens.set(saved.desktopId, 'saved-token');
    const transport = new FakeTransport();
    transport.resolveError = new Error('Saved PC discovery timed out.');
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true);

    await manager.connectSaved(saved);

    expect(transport.connectedPeripheralIds).toEqual([]);
    expect(manager.snapshot()).toMatchObject({ kind: 'failed', message: 'Could not find this PC nearby.' });
  });

  it('connects the explicit default and otherwise the most recent saved PC', async () => {
    const storage = new FakeStorage();
    storage.saved = [pc('recent', 2), pc('default', 1)];
    storage.tokens.set('recent', 'recent-token');
    storage.tokens.set('default', 'default-token');
    storage.defaultId = 'default';
    const transport = new FakeTransport();
    transport.resolvedDesktop = { ...pc('default'), rssi: -40 };
    transport.failReadiness = true;
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true);

    await manager.connectPreferred();
    expect(transport.resolveDesktopIds).toEqual(['default']);

    storage.defaultId = null;
    transport.resolvedDesktop = { ...pc('recent'), rssi: -40 };
    await manager.connectPreferred();
    expect(transport.resolveDesktopIds).toEqual(['default', 'recent']);
  });

  it('does not cascade through other saved PCs when the preferred PC is unavailable', async () => {
    const storage = new FakeStorage();
    storage.saved = [pc('preferred', 2), pc('other', 1)];
    storage.tokens.set('preferred', 'preferred-token');
    storage.tokens.set('other', 'other-token');
    const transport = new FakeTransport();
    transport.resolveError = new Error('not nearby');
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true);

    await manager.connectPreferred();
    expect(transport.resolveDesktopIds).toEqual(['preferred']);
    expect(manager.snapshot()).toMatchObject({ kind: 'failed', message: 'Could not find this PC nearby.' });
  });

  it('cancels a pending preferred-PC connection when Remote loses focus', async () => {
    let release!: () => void;
    const storage = new FakeStorage();
    storage.saved = [pc('preferred')];
    storage.tokens.set('preferred', 'preferred-token');
    const transport = new FakeTransport();
    transport.resolveGate = new Promise<void>((resolve) => { release = resolve; });
    transport.resolvedDesktop = { ...pc('preferred'), rssi: -40 };
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true);

    const connecting = manager.connectPreferred();
    await waitFor(() => transport.resolveDesktopIds.length === 1);
    const cancelling = manager.cancelPreferredConnection();
    release();
    await Promise.all([connecting, cancelling]);

    expect(transport.connectedPeripheralIds).toEqual([]);
    expect(manager.snapshot()).toMatchObject({ kind: 'idle', saved: [{ desktopId: 'preferred' }] });
  });

  it('never opens pairing when saved metadata has no token', async () => {
    const storage = new FakeStorage();
    const saved = pc('orphan');
    storage.saved = [saved];
    const transport = new FakeTransport();
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true);

    await manager.connectSaved(saved);
    expect(transport.resolveDesktopIds).toEqual([]);
    expect(storage.saved).toEqual([]);
    expect(manager.snapshot()).toMatchObject({ kind: 'failed', message: 'Saved access is no longer available. Request access again.' });
  });

  it('does not remove saved metadata when secure token loading fails', async () => {
    const storage = new FakeStorage();
    const saved = pc('pc-1');
    storage.saved = [saved];
    storage.tokens.set(saved.desktopId, 'saved-token');
    storage.failTokenRead = true;
    const transport = new FakeTransport();
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true);

    await manager.connectSaved(saved);
    expect(storage.saved).toEqual([saved]);
    expect(storage.tokens.get(saved.desktopId)).toBe('saved-token');
    expect(transport.resolveDesktopIds).toEqual([]);
    expect(manager.snapshot()).toMatchObject({ kind: 'failed', message: 'Could not load saved access. Try again.' });
  });

  it('waits for foreground cleanup before auto-connecting again', async () => {
    let finishCleanup!: () => void;
    const storage = new FakeStorage();
    storage.saved = [pc('pc-1')];
    storage.tokens.set('pc-1', 'saved-token');
    const transport = new FakeTransport();
    transport.resolvedDesktop = { ...pc('pc-1'), rssi: -40 };
    transport.failReadiness = true;
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true);
    manager.registerCleanup(() => new Promise<void>((resolve) => { finishCleanup = resolve; }));

    const disconnecting = manager.disconnect();
    const connecting = manager.connectPreferred();
    await Promise.resolve();
    expect(transport.resolveDesktopIds).toEqual([]);
    finishCleanup();
    await Promise.all([disconnecting, connecting]);
    expect(transport.resolveDesktopIds).toEqual(['pc-1']);
  });

  it('runs registered input cleanup before switching to another saved PC', async () => {
    let finishCleanup!: () => void;
    const storage = new FakeStorage();
    storage.saved = [pc('target')];
    storage.tokens.set('target', 'saved-token');
    const transport = new FakeTransport();
    transport.resolvedDesktop = { ...pc('target'), rssi: -40 };
    transport.failReadiness = true;
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true);
    manager.registerCleanup(() => new Promise<void>((resolve) => { finishCleanup = resolve; }));

    const switching = manager.switchSaved(storage.saved[0]!);
    await waitFor(() => finishCleanup !== undefined);
    expect(transport.resolveDesktopIds).toEqual([]);
    finishCleanup();
    await switching;
    expect(transport.resolveDesktopIds).toEqual(['target']);
  });

  it('does not reconnect a queued quick switch after a background disconnect', async () => {
    let finishCleanup!: () => void;
    const storage = new FakeStorage();
    storage.saved = [pc('target')];
    storage.tokens.set('target', 'saved-token');
    const transport = new FakeTransport();
    transport.resolvedDesktop = { ...pc('target'), rssi: -40 };
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true);
    manager.registerCleanup(() => new Promise<void>((resolve) => { finishCleanup = resolve; }));

    const switching = manager.switchSaved(storage.saved[0]!);
    await waitFor(() => finishCleanup !== undefined);
    const backgrounding = manager.disconnect();
    finishCleanup();
    await Promise.all([switching, backgrounding]);

    expect(transport.resolveDesktopIds).toEqual([]);
    expect(manager.snapshot()).toMatchObject({ kind: 'idle', saved: [{ desktopId: 'target' }] });
  });

  it('cancels a stale saved-PC lookup when another quick switch wins', async () => {
    let releaseFirst!: () => void;
    const storage = new FakeStorage();
    storage.saved = [pc('first'), pc('second')];
    storage.tokens.set('first', 'first-token');
    storage.tokens.set('second', 'second-token');
    const transport = new FakeTransport();
    let firstStarted!: () => void;
    const firstStartedPromise = new Promise<void>((resolve) => { firstStarted = resolve; });
    transport.resolveStarted = (desktopId) => { if (desktopId === 'first') firstStarted(); };
    transport.resolveGates.set('first', new Promise<void>((resolve) => { releaseFirst = resolve; }));
    transport.resolvedDesktop = { ...pc('second'), rssi: -40 };
    transport.failReadiness = true;
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true);

    const first = manager.switchSaved(storage.saved[0]!);
    await firstStartedPromise;
    const second = manager.switchSaved(storage.saved[1]!);
    await second;
    releaseFirst();
    await first;

    expect(transport.resolveDesktopIds).toEqual(['first', 'second']);
    expect(manager.snapshot()).toMatchObject({ kind: 'failed', message: 'Could not connect to this PC.' });
  });

  it('cancels an in-flight switch and reconnects when the displayed PC is selected again', async () => {
    let finishCleanup!: () => void;
    let releaseCurrent!: () => void;
    const storage = new FakeStorage();
    storage.saved = [pc('current'), pc('other')];
    storage.tokens.set('current', 'current-token');
    storage.tokens.set('other', 'other-token');
    const transport = new FakeTransport();
    transport.resolveGates.set('current', new Promise<void>((resolve) => { releaseCurrent = resolve; }));
    transport.resolvedDesktop = { ...pc('current'), rssi: -40 };
    transport.failReadiness = true;
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true);
    manager.registerCleanup(() => new Promise<void>((resolve) => { finishCleanup = resolve; }));

    const currentConnection = manager.connectSaved(storage.saved[0]!);
    await waitFor(() => manager.snapshot().kind === 'connecting');
    const switchingAway = manager.switchSaved(storage.saved[1]!);
    await waitFor(() => finishCleanup !== undefined);
    const switchingBack = manager.switchSaved(storage.saved[0]!);
    finishCleanup();
    releaseCurrent();
    await Promise.all([currentConnection, switchingAway, switchingBack]);

    expect(transport.resolveDesktopIds).toEqual(['current', 'current']);
    expect(manager.snapshot()).toMatchObject({ kind: 'failed', message: 'Could not connect to this PC.' });
  });

  it('ignores a quick-switch request for the active connection target', async () => {
    let release!: () => void;
    const storage = new FakeStorage();
    storage.saved = [pc('current')];
    storage.tokens.set('current', 'saved-token');
    const transport = new FakeTransport();
    transport.resolveGate = new Promise<void>((resolve) => { release = resolve; });
    transport.resolvedDesktop = { ...pc('current'), rssi: -40 };
    transport.failReadiness = true;
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true);

    const connecting = manager.connectSaved(storage.saved[0]!);
    await waitFor(() => transport.resolveDesktopIds.length === 1);
    await manager.switchSaved(storage.saved[0]!);
    expect(transport.resolveDesktopIds).toEqual(['current']);
    release();
    await connecting;
  });

  it('does not let initial pairing load invalidate an early Remote focus connection', async () => {
    let finishLoad!: () => void;
    const storage = new FakeStorage();
    storage.saved = [pc('pc-1')];
    storage.tokens.set('pc-1', 'saved-token');
    storage.listGate = new Promise<void>((resolve) => { finishLoad = resolve; });
    const transport = new FakeTransport();
    transport.resolvedDesktop = { ...pc('pc-1'), rssi: -40 };
    transport.failReadiness = true;
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true);

    const connecting = manager.connectPreferred();
    const loading = manager.load();
    finishLoad();
    await Promise.all([connecting, loading]);
    expect(transport.resolveDesktopIds).toEqual(['pc-1']);
  });
});
