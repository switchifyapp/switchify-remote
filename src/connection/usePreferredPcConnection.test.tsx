import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import type { ConnectionManager } from './ConnectionManager';
import { shouldConnectOnFocus, usePreferredPcConnection } from './usePreferredPcConnection';

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return { useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(callback, [callback]) };
});

describe('preferred PC focus lifecycle', () => {
  it('starts during bridge initialization unless the app is explicitly inactive', () => {
    expect(shouldConnectOnFocus(null)).toBe(true);
    expect(shouldConnectOnFocus('active')).toBe(true);
    expect(shouldConnectOnFocus('background')).toBe(false);
    expect(shouldConnectOnFocus('inactive')).toBe(false);
  });

  it('connects once on focus and once after a foreground return without render retries', async () => {
    const connectPreferred = jest.fn(async () => undefined);
    const cancelPreferredConnection = jest.fn(async () => undefined);
    let appStateListener: ((state: AppStateStatus) => void) | null = null;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove };
    });
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    const manager = { connectPreferred, cancelPreferredConnection } as unknown as ConnectionManager;

    const view = await renderHook(() => usePreferredPcConnection(manager));
    expect(connectPreferred).toHaveBeenCalledTimes(1);

    await view.rerender({});
    expect(connectPreferred).toHaveBeenCalledTimes(1);

    await act(async () => { appStateListener?.('background'); appStateListener?.('active'); });
    expect(connectPreferred).toHaveBeenCalledTimes(2);

    await view.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(cancelPreferredConnection).toHaveBeenCalledTimes(1);
  });
});
