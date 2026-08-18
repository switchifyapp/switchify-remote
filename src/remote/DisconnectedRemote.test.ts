import type { SavedPc } from '@/storage/PairingStore';
import { disconnectedRemotePresentation } from './DisconnectedRemote';

const saved: SavedPc = { desktopId: 'pc-1', displayName: 'Office', platform: 'windows', peripheralId: 'ble-1', lastConnectedAt: 1 };

describe('disconnected Remote flow', () => {
  it('offers discovery when there are no saved PCs', () => {
    expect(disconnectedRemotePresentation({ kind: 'idle', saved: [] })).toMatchObject({
      title: 'No saved PCs', primaryAction: null, chooseAction: 'Find a PC', busy: false,
    });
  });

  it('keeps an auto-connect failure on Remote with Retry and Choose another PC', () => {
    expect(disconnectedRemotePresentation({ kind: 'failed', message: 'Could not find this PC nearby.', saved: [saved] })).toEqual({
      title: 'Could not connect', message: 'Could not find this PC nearby.', primaryAction: 'Retry', chooseAction: 'Choose another PC', busy: false,
    });
  });

  it('exposes connection progress without competing actions', () => {
    expect(disconnectedRemotePresentation({ kind: 'connecting', desktop: { ...saved, rssi: null } })).toMatchObject({
      title: 'Connecting', message: 'Connecting to Office.', primaryAction: null, chooseAction: null, busy: true,
    });
  });
});
