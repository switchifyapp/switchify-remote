import { useCallback } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import type { ConnectionManager } from './ConnectionManager';

export function shouldConnectOnFocus(state: typeof AppState.currentState | null): boolean {
  return state !== 'background' && state !== 'inactive';
}

export function usePreferredPcConnection(manager: ConnectionManager): void {
  useFocusEffect(useCallback(() => {
    let focused = true;
    let wasInactive = !shouldConnectOnFocus(AppState.currentState);
    const connect = () => { if (focused) void manager.connectPreferred(); };
    if (!wasInactive) connect();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') { wasInactive = true; return; }
      if (wasInactive) { wasInactive = false; connect(); }
    });
    return () => { focused = false; subscription.remove(); };
  }, [manager]));
}
