import type { SavedPc } from '@/storage/PairingStore';
import type { DiscoveredDesktop } from '@/transport/BleTransport';
import { mergePcList, pcListAction } from './pcList';

const saved = (desktopId: string, displayName = desktopId): SavedPc => ({ desktopId, displayName, platform: 'windows', peripheralId: `old-${desktopId}`, lastConnectedAt: 1 });
const nearby = (desktopId: string, displayName = desktopId): DiscoveredDesktop => ({ desktopId, displayName, platform: 'windows', peripheralId: `new-${desktopId}`, rssi: -40 });

describe('PC list identity', () => {
  it('merges a saved discovery into one row and prefers current discovery details', () => {
    const rows = mergePcList([saved('pc-1', 'Old name')], [nearby('pc-1', 'Office PC')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ desktopId: 'pc-1', displayName: 'Office PC', peripheralId: 'new-pc-1', nearby: true, saved: { desktopId: 'pc-1' } });
  });

  it('never merges computers by display name or BLE address', () => {
    const rows = mergePcList(
      [saved('saved-id', 'Switchify PC')],
      [nearby('new-id', 'Switchify PC'), { ...nearby('third-id', 'Other PC'), peripheralId: 'old-saved-id' }],
    );
    expect(rows.map((row) => row.desktopId)).toEqual(['saved-id', 'new-id', 'third-id']);
    expect(rows.map((row) => Boolean(row.saved))).toEqual([true, false, false]);
    expect(rows.map(pcListAction)).toEqual(['Connect', 'Request access', 'Request access']);
  });
});
