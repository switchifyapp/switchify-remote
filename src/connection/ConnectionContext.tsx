import { AppState } from 'react-native';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

import { DiagnosticLog } from '@/diagnostics/DiagnosticLog';
import { PairingStore } from '@/storage/PairingStore';
import { preferencesStore } from '@/storage/PreferencesStore';
import { resolveRemoteName } from '@/device/remoteName';
import { ReactNativeBleTransport } from '@/transport/ReactNativeBleTransport';
import { ConnectionManager, type ConnectionState } from './ConnectionManager';
import { requestBluetoothPermission } from './permissions';

const Context = createContext<ConnectionManager | null>(null);

export function ConnectionProvider({ children }: PropsWithChildren) {
  const manager = useMemo(() => new ConnectionManager(
    new ReactNativeBleTransport(),
    new PairingStore(),
    new DiagnosticLog(),
    requestBluetoothPermission,
    Date.now,
    undefined,
    undefined,
    async () => {
      await preferencesStore.load();
      return resolveRemoteName(preferencesStore.snapshot().remoteName);
    },
  ), []);
  useEffect(() => {
    void manager.load();
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') void manager.disconnect(); });
    return () => { subscription.remove(); void manager.disconnect(); };
  }, [manager]);
  return <Context.Provider value={manager}>{children}</Context.Provider>;
}

export function useConnectionManager(): ConnectionManager {
  const manager = useContext(Context);
  if (!manager) throw new Error('ConnectionProvider is missing.');
  return manager;
}

export function useConnectionState(): ConnectionState {
  const manager = useConnectionManager();
  return useSyncExternalStore(manager.subscribe, manager.snapshot, manager.snapshot);
}
