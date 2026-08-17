import { Platform, StyleSheet, View } from 'react-native';
import { ControlButton } from '@/components/ControlButton';
import { preferencesStore, type RemoteSurface } from '@/storage/PreferencesStore';

export function SurfaceSelector({ selected }: { selected: RemoteSurface }) {
  const surfaces: RemoteSurface[] = Platform.OS === 'android' ? ['mouse', 'typing', 'window', 'forwarding'] : ['mouse', 'typing', 'window'];
  return <View accessibilityRole="tablist" style={styles.row}>{surfaces.map((surface) => <ControlButton key={surface} role="tab" label={surface[0]!.toUpperCase() + surface.slice(1)} selected={selected === surface} onPress={() => void preferencesStore.update({ surface })} />)}</View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
