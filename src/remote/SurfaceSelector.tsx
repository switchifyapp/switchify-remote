import { StyleSheet, View } from 'react-native';
import { ControlButton } from '@/components/ControlButton';
import { preferencesStore, type RemoteSurface } from '@/storage/PreferencesStore';

export function SurfaceSelector({ selected }: { selected: RemoteSurface }) {
  return <View accessibilityRole="tablist" style={styles.row}>{(['mouse', 'typing', 'window'] as const).map((surface) => <ControlButton key={surface} label={surface === 'mouse' ? 'Mouse' : surface === 'typing' ? 'Typing' : 'Window'} selected={selected === surface} onPress={() => void preferencesStore.update({ surface })} />)}</View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 8 } });
