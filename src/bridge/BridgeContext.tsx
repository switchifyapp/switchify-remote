import { createContext, type PropsWithChildren, useContext, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { switchifyBridge } from './SwitchifyBridgeClient';
import type { BridgeSnapshot, SwitchifyBridge } from './types';

const BridgeContext = createContext<SwitchifyBridge>(switchifyBridge);

export function BridgeProvider({ children, bridge = switchifyBridge }: PropsWithChildren<{ bridge?: SwitchifyBridge }>) {
  useEffect(() => {
    void bridge.connect();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void bridge.connect();
      else void bridge.disconnect();
    });
    return () => { subscription.remove(); void bridge.disconnect(); };
  }, [bridge]);
  return <BridgeContext.Provider value={bridge}>{children}</BridgeContext.Provider>;
}

export function useSwitchifyBridge(): SwitchifyBridge {
  return useContext(BridgeContext);
}

export function useBridgeSnapshot(): BridgeSnapshot {
  const bridge = useSwitchifyBridge();
  return useSyncExternalStore(
    (listener) => bridge.subscribe((event) => { if (event.type === 'snapshot') listener(); }),
    bridge.snapshot,
    bridge.snapshot,
  );
}
