import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '@/constants/colors';

export function ActionButton({ label, onPress, disabled = false, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, pressed && !disabled && styles.pressed, disabled && styles.disabled]}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: 14, justifyContent: 'center', minHeight: 52, paddingHorizontal: 18 },
  secondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1 },
  pressed: { backgroundColor: colors.brandPressed },
  disabled: { opacity: 0.45 },
  label: { color: colors.text, fontSize: 17, fontWeight: '700' },
});
