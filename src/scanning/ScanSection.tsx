import { ScanGroupScope } from '@switchify/scanning/native';
import type { PropsWithChildren } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { ScanGroupHighlight } from './ScanHighlight';
import { useScannableGroup } from './useScannable';

/**
 * Scans its controls as one group. Select enters the section, the controls are
 * then scanned in turn, and a final "Leave section" stop returns to the page.
 * `exclusive` confines scanning to it while mounted, for dialogs.
 */
export function ScanSection({ children, exclusive = false, radius = 16, style }: PropsWithChildren<{ exclusive?: boolean; radius?: number; style?: StyleProp<ViewStyle> }>) {
  const { id, attach, onLayout, highlighted, entered, escapeHighlighted } = useScannableGroup({ exclusive });
  return <View ref={attach} onLayout={onLayout} style={[{ position: 'relative' }, style]}>
    <ScanGroupScope id={id}>{children}</ScanGroupScope>
    <ScanGroupHighlight highlighted={highlighted} entered={entered} escapeHighlighted={escapeHighlighted} radius={radius} />
  </View>;
}
