import { Policy } from '@switchify/scanning';
import { ScanProvider } from '@switchify/scanning/native';
import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

import { usePreferences } from '@/storage/usePreferences';
import { ScanningEnabledContext } from './ScanningContext';
import { SwitchInput, switchInputSupported } from './SwitchInput';

/**
 * Scans the whole app once switch scanning is on in Settings. The menu policy keeps
 * the highlight on a control after it is used, so repeated presses such as moving
 * the pointer stay quick.
 */
export function ScanningProvider({ children }: PropsWithChildren) {
  const { scanning } = usePreferences();
  const enabled = scanning.enabled && switchInputSupported;
  return <ScanProvider policy={Policy.MENU} options={{ automatic: scanning.automatic, intervalMs: scanning.intervalMs, pattern: scanning.pattern, passLimit: 3 }}>
    <ScanningEnabledContext.Provider value={enabled}>
      <View style={{ flex: 1 }}>
        {children}
        {enabled ? <SwitchInput settings={scanning.switches} /> : null}
      </View>
    </ScanningEnabledContext.Provider>
  </ScanProvider>;
}
