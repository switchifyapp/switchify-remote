import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, StyleSheet, useWindowDimensions } from 'react-native';

import type { ConnectionState } from '@/connection/ConnectionManager';
import type { SavedPc } from '@/storage/PairingStore';
import { ThemeProvider } from '@/theme/ThemeContext';
import { RemoteDeviceSwitcher, remoteDevicePresentation } from './RemoteDeviceSwitcher';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn() }));

const mockWindowDimensions = useWindowDimensions as jest.MockedFunction<typeof useWindowDimensions>;
const office: SavedPc = { desktopId: 'office', displayName: 'Office PC', platform: 'windows', peripheralId: 'ble-office', lastConnectedAt: 2 };
const studio: SavedPc = { desktopId: 'studio', displayName: 'Studio Mac', platform: 'macos', peripheralId: 'ble-studio', lastConnectedAt: 1 };
const desktop = (pc: SavedPc) => ({ ...pc, rssi: null });
const connected = (pc = office): ConnectionState => ({ kind: 'connected', desktop: desktop(pc), profile: null, profileStatus: 'recovering' });

describe('RemoteDeviceSwitcher', () => {
  beforeEach(() => {
    mockWindowDimensions.mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
    jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    [{ kind: 'idle', saved: [] } as ConnectionState, { name: 'Choose PC', status: 'Not connected' }],
    [{ kind: 'connecting', desktop: desktop(office) } as ConnectionState, { name: 'Office PC', status: 'Connecting' }],
    [{ kind: 'pairing', desktop: desktop(office), verificationCode: '123456' } as ConnectionState, { name: 'Office PC', status: 'Pairing' }],
    [{ kind: 'reconnecting', desktop: desktop(office), attempt: 2 } as ConnectionState, { name: 'Office PC', status: 'Reconnecting' }],
    [connected(), { name: 'Office PC', status: 'Connected' }],
    [{ kind: 'failed', message: 'Unavailable', saved: [office] } as ConnectionState, { name: 'Choose PC', status: 'Not connected' }],
  ])('presents every connection state without exposing connection details', (state, expected) => {
    expect(remoteDevicePresentation(state)).toEqual(expected);
  });

  it('shows the current PC, preserves preferred ordering, and switches immediately', async () => {
    const manager = { listSaved: jest.fn(async () => [studio, office]), switchSaved: jest.fn(async () => undefined) };
    const view = await render(<ThemeProvider><RemoteDeviceSwitcher connection={connected(office)} manager={manager} managePcs={() => undefined} /></ThemeProvider>);
    const switcher = view.getByRole('button', { name: 'Switch PC' });
    expect(switcher.props.accessibilityValue).toEqual({ text: 'Connected, Office PC' });
    expect(StyleSheet.flatten(switcher.props.style).minHeight).toBeGreaterThanOrEqual(48);

    await act(async () => fireEvent.press(switcher));
    expect((await view.findAllByRole('button')).map((button) => button.props.accessibilityLabel)).toEqual(['Switch PC', 'Studio Mac', 'Office PC', 'Manage PCs', 'Close']);
    expect(view.getByRole('button', { name: 'Office PC', selected: true })).toBeTruthy();
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Studio Mac' })));
    expect(manager.switchSaved).toHaveBeenCalledWith(studio);
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenCalledWith('Connecting to Studio Mac.', { queue: true });
    await waitFor(() => expect(view.queryByTestId('pc-switcher-modal')).toBeNull());
  });

  it('dismisses without reconnecting when the current PC is chosen', async () => {
    const manager = { listSaved: jest.fn(async () => [office]), switchSaved: jest.fn(async () => undefined) };
    const view = await render(<RemoteDeviceSwitcher connection={connected()} manager={manager} managePcs={() => undefined} />);
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Switch PC' })));
    await act(async () => fireEvent.press(await view.findByRole('button', { name: 'Office PC' })));
    expect(manager.switchSaved).not.toHaveBeenCalled();
    await waitFor(() => expect(view.queryByTestId('pc-switcher-modal')).toBeNull());
  });

  it('stays available while disconnected and routes empty state to Manage PCs', async () => {
    const managePcs = jest.fn();
    const manager = { listSaved: jest.fn(async () => []), switchSaved: jest.fn(async () => undefined) };
    const view = await render(<RemoteDeviceSwitcher connection={{ kind: 'idle', saved: [] }} manager={manager} managePcs={managePcs} />);
    expect(view.getByText('Choose PC')).toBeTruthy();
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Switch PC' })));
    expect(await view.findByText('No saved PCs')).toBeTruthy();
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Manage PCs' })));
    expect(managePcs).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId('pc-switcher-modal')).toBeNull();
  });

  it('supports dismissal through the scrim, system back, and accessibility escape', async () => {
    const manager = { listSaved: jest.fn(async () => [office]), switchSaved: jest.fn(async () => undefined) };
    const view = await render(<RemoteDeviceSwitcher connection={connected()} manager={manager} managePcs={() => undefined} />);
    const open = async () => { await act(async () => fireEvent.press(view.getByRole('button', { name: 'Switch PC' }))); await view.findByTestId('pc-switcher-modal'); };
    await open();
    await act(async () => fireEvent.press(view.getByTestId('pc-switcher-scrim', { includeHiddenElements: true })));
    expect(view.queryByTestId('pc-switcher-modal')).toBeNull();
    await open();
    await act(async () => view.getByTestId('pc-switcher-modal').props.onRequestClose());
    expect(view.queryByTestId('pc-switcher-modal')).toBeNull();
    await open();
    await act(async () => view.getByTestId('pc-switcher-dialog').props.onAccessibilityEscape());
    expect(view.queryByTestId('pc-switcher-modal')).toBeNull();
  });

  it('uses non-animated modal presentation on Android', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const manager = { listSaved: jest.fn(async () => [office]), switchSaved: jest.fn(async () => undefined) };
    const view = await render(<RemoteDeviceSwitcher connection={connected()} manager={manager} managePcs={() => undefined} />);
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Switch PC' })));
    expect(view.getByTestId('pc-switcher-modal').props.animationType).toBe('none');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });
});
