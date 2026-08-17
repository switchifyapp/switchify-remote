import { DiagnosticLog } from '@/diagnostics/DiagnosticLog';
import type { PairingStorage, SavedPc } from '@/storage/PairingStore';
import type { BleAvailability, BleTransport, DiscoveredDesktop, Unsubscribe } from '@/transport/BleTransport';
import { ConnectionManager } from './ConnectionManager';
import { pairingVerificationCode } from './verificationCode';

class FakeStorage implements PairingStorage {
  saved: SavedPc[] = [];
  tokens = new Map<string, string>();
  defaultId: string | null = null;
  failRemove = false;
  getDeviceId = async () => 'device-1'; list = async () => this.saved; token = async (id: string) => this.tokens.get(id) ?? null;
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
  resolveDesktopIds: string[] = [];
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
  resolveAndConnect = async (desktopId: string) => {
    this.resolveDesktopIds.push(desktopId);
    await this.resolveGate;
    if (this.resolveError) throw this.resolveError;
    if (!this.resolvedDesktop) throw new Error('not found');
    return this.resolvedDesktop;
  };
  cancelPendingWrites = async () => undefined;
  notificationsReady = async () => { if (this.failReadiness) throw new Error('readiness failed'); };
  subscribe(): Unsubscribe { return () => undefined; } subscribeDisconnect(): Unsubscribe { return () => undefined; }
}

const pc = (id: string, lastConnectedAt = 1): SavedPc => ({ desktopId: id, displayName: id, platform: 'windows', peripheralId: `ble-${id}`, lastConnectedAt });

const waitFor = async (condition: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 20 && !condition(); attempt += 1) await Promise.resolve();
  expect(condition()).toBe(true);
};

describe('connection lifecycle', () => {
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
    const transport = new FakeTransport();
    transport.resolveError = new Error('Saved PC discovery timed out.');
    const manager = new ConnectionManager(transport, storage, new DiagnosticLog(), async () => true);

    await manager.connectSaved(saved);

    expect(transport.connectedPeripheralIds).toEqual([]);
    expect(manager.snapshot()).toMatchObject({ kind: 'failed', message: 'Could not find this PC nearby.' });
  });
});
