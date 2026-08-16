import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '@/constants/colors';

export function ControlButton({ label, hint, onPress, selected = false, disabled = false, danger = false }: { label: string; hint?: string; onPress: () => void; selected?: boolean; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityHint={hint} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, selected && styles.selected, danger && styles.danger, pressed && styles.pressed, disabled && styles.disabled]}>
      <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={2} style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: 15, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 58, minWidth: 58, padding: 8 },
  selected: { backgroundColor: colors.brand, borderColor: colors.brand }, danger: { borderColor: colors.danger }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.35 },
  label: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
