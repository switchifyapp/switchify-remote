import { render } from '@testing-library/react-native';
import { createElement } from 'react';
import { Text } from 'react-native';

import type { ConnectionState } from '@/connection/ConnectionManager';
import type { PointerProfile } from '@/domain/protocol/types';
import RemoteScreen from '@/app/(tabs)/remote';

const mockSurface = (label: string) => createElement(Text, null, label);

const mockManager = {
  connectPreferred: jest.fn(),
  registerCleanup: jest.fn(() => () => undefined),
};
const mockBridge = {
  connect: jest.fn(async () => true),
  disconnect: jest.fn(async () => undefined),
  nextGeneration: jest.fn(() => 1),
  setForwardingActive: jest.fn(async () => true),
  setRepeatActive: jest.fn(async () => true),
  snapshot: jest.fn(() => ({ version: 1, captureAvailable: false, externalSwitches: [] })),
  subscribe: jest.fn(() => () => undefined),
};
const mockBridgeSnapshot = { version: 1, captureAvailable: false, externalSwitches: [] };
let mockPreferences = { surface: 'mouse' as 'mouse' | 'typing' | 'window' | 'forwarding', typingMode: 'live' as const, draft: '', forwardingHoldToStopMs: 5_000, forwardingProfiles: {}, remoteName: null };
const mockSessionState = { repeat: null, dragging: false, modifiers: [], streamOpen: false };
let mockConnection: ConnectionState;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ navigate: jest.fn() }),
}));
jest.mock('@/bridge/BridgeContext', () => ({
  useBridgeSnapshot: () => mockBridgeSnapshot,
  useSwitchifyBridge: () => mockBridge,
}));
jest.mock('@/connection/ConnectionContext', () => ({
  useConnectionManager: () => mockManager,
  useConnectionState: () => mockConnection,
}));
jest.mock('@/connection/usePreferredPcConnection', () => ({ usePreferredPcConnection: () => undefined }));
jest.mock('@/storage/usePreferences', () => ({ usePreferences: () => mockPreferences }));
jest.mock('@/remote/useProfileStatusAnnouncement', () => ({ useProfileStatusAnnouncement: () => undefined }));
jest.mock('@/remote/RemoteDeviceSwitcher', () => ({ RemoteDeviceSwitcher: () => null }));
jest.mock('@/remote/RemoteSession', () => ({
  RemoteSession: class {
    cleanup = jest.fn(async () => undefined);
    dispose = jest.fn();
    snapshot = () => mockSessionState;
    subscribe = () => () => undefined;
  },
}));
jest.mock('@/remote/MouseSurface', () => ({ MouseSurface: () => mockSurface('Mouse controls') }));
jest.mock('@/remote/TypingSurface', () => ({ TypingSurface: () => mockSurface('Typing controls') }));
jest.mock('@/remote/WindowSurface', () => ({ WindowSurface: () => mockSurface('Window controls') }));
jest.mock('@/forwarding/ForwardingSurface', () => ({
  ForwardingRestoreState: class { clear = jest.fn(); },
  ForwardingSurface: () => mockSurface('Forwarding controls'),
  shouldClearForwardingRestore: () => false,
}));

const desktop = { desktopId: 'desktop-1', displayName: 'Office PC', platform: 'windows' as const, peripheralId: 'peripheral-1', rssi: -50 };
const profile: PointerProfile = {
  displayId: 'display-1', scaleFactor: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, maxDelta: 128,
  recommendedDeltas: { small: 16, medium: 32, large: 64 },
  capabilities: {
    noAckMouseMove: false, noAckCommands: [], supportedCommands: [],
    mouseRepeat: { supported: false, enabled: false, intervalMs: 250, minIntervalMs: 100, maxIntervalMs: 2_000 },
    pointerSpeed: { supported: false, setSupported: false, scalePercent: 100, minScalePercent: 5, maxScalePercent: 225, stepPercent: 5, baseMoveDelta: 32, effectiveMoveDelta: 32 },
    displayNavigation: { supported: false, displayCount: 1 },
  },
};

describe('RemoteScreen sticky surface selector', () => {
  beforeEach(() => {
    mockConnection = { kind: 'connected', desktop, profile, profileStatus: 'ready' };
    mockPreferences = { surface: 'mouse', typingMode: 'live', draft: '', forwardingHoldToStopMs: 5_000, forwardingProfiles: {}, remoteName: null };
    jest.clearAllMocks();
  });

  it('pins the selector when connected controls are available', async () => {
    const view = await render(<RemoteScreen />);
    expect(view.getByTestId('screen-sticky-accessory')).toBeTruthy();
    expect(view.getByTestId('screen-scroll-to-top-container')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Surface' })).toBeTruthy();
    expect(view.getByText('Mouse controls')).toBeTruthy();
  });

  it.each([
    ['mouse', 'Mouse controls'],
    ['typing', 'Typing controls'],
    ['window', 'Window controls'],
    ['forwarding', 'Forwarding controls'],
  ] as const)('enables scroll-to-top for the connected %s controls', async (surface, label) => {
    mockPreferences = { ...mockPreferences, surface };
    const view = await render(<RemoteScreen />);
    expect(view.getByTestId('screen-scroll-to-top-container')).toBeTruthy();
    expect(view.getByText(label)).toBeTruthy();
  });

  it('does not expose the selector while a profile is recovering or unavailable', async () => {
    mockConnection = { kind: 'connected', desktop, profile: null, profileStatus: 'recovering' };
    const view = await render(<RemoteScreen />);
    expect(view.queryByTestId('screen-sticky-accessory')).toBeNull();
    expect(view.queryByTestId('screen-scroll-to-top-container')).toBeNull();
    expect(view.queryByRole('button', { name: 'Surface' })).toBeNull();

    mockConnection = { kind: 'connected', desktop, profile: null, profileStatus: 'unavailable' };
    await view.rerender(<RemoteScreen />);
    expect(view.queryByTestId('screen-sticky-accessory')).toBeNull();
    expect(view.queryByTestId('screen-scroll-to-top-container')).toBeNull();
    expect(view.queryByRole('button', { name: 'Surface' })).toBeNull();
  });

  it('pins the selector in disconnected states', async () => {
    mockConnection = { kind: 'idle', saved: [] };
    const view = await render(<RemoteScreen />);
    expect(view.getByTestId('screen-sticky-accessory')).toBeTruthy();
    expect(view.queryByTestId('screen-scroll-to-top-container')).toBeNull();
    expect(view.getByRole('button', { name: 'Surface' })).toBeTruthy();
  });
});
