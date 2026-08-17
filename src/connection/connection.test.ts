import { DiagnosticLog } from '@/diagnostics/DiagnosticLog';
import type { PairingStorage, SavedPc } from '@/storage/PairingStore';
import type { BleTransport, DiscoveredDesktop, Unsubscribe } from '@/transport/BleTransport';
import { ConnectionManager } from './ConnectionManager';
import { pairingVerificationCode } from './verificationCode';

class FakeStorage implements PairingStorage {
  saved: SavedPc[] = [];
  tokens = new Map<string, string>();
  getDeviceId = async () => 'device-1'; list = async () => this.saved; token = async (id: string) => this.tokens.get(id) ?? null;
  save = async (pc: SavedPc, token: string) => { this.saved = [pc]; this.tokens.set(pc.desktopId, token); };
  remove = async (id: string) => { this.saved = []; this.tokens.delete(id); };
  defaultDesktopId = async () => null; setDefaultDesktopId = async () => undefined;
}

class FakeTransport implements BleTransport {
  scanCallback: ((pc: DiscoveredDesktop) => void) | null = null;
  scan(onDesktop: (desktop: DiscoveredDesktop) => void): Unsubscribe { this.scanCallback = onDesktop; return () => { this.scanCallback = null; }; }
  connect = async () => undefined; disconnect = async () => undefined; writeFrame = async () => undefined;
  subscribe(): Unsubscribe { return () => undefined; } subscribeDisconnect(): Unsubscribe { return () => undefined; }
}

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

  it('keeps permission denial outside the transport', async () => {
    const manager = new ConnectionManager(new FakeTransport(), new FakeStorage(), new DiagnosticLog(), async () => false);
    await manager.scan();
    expect(manager.snapshot().kind).toBe('permissionDenied');
  });
});
