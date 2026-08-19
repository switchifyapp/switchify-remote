import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps, Ref } from 'react';
import { Animated, Pressable, Text, type AccessibilityRole, type View } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
import { usePressScale } from './usePressScale';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export function ControlButton({ label, accessibilityLabel = label, hint, onPress, selected = false, disabled = false, danger = false, role = 'button', icon, size = 'standard', compact = false, emphasized = false, controlRef }: { label: string; accessibilityLabel?: string; hint?: string; onPress: () => void; selected?: boolean; disabled?: boolean; danger?: boolean; role?: AccessibilityRole; icon?: IconName; size?: 'standard' | 'key'; compact?: boolean; emphasized?: boolean; controlRef?: Ref<View> }) {
  const { colors, radii, spacing, typography } = useTheme();
  const press = usePressScale(selected);
  return (
    <Animated.View style={{ flex: 1, minWidth: 48, transform: [{ scale: press.scale }] }}><Pressable ref={controlRef} accessibilityRole={role} accessibilityLabel={accessibilityLabel} accessibilityHint={hint} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} onPressIn={press.pressIn} onPressOut={press.pressOut} style={({ pressed }) => ({ alignItems: 'center', backgroundColor: selected ? colors.brand : emphasized ? colors.brandTint : pressed ? colors.surfacePressed : compact ? 'transparent' : colors.surfaceRaised, borderColor: danger ? colors.danger : selected ? colors.brand : compact ? 'transparent' : colors.border, borderRadius: radii.md, borderWidth: 1, flex: 1, flexDirection: icon || selected ? 'row' : undefined, gap: spacing.xs, justifyContent: 'center', minHeight: compact ? 48 : size === 'key' ? 64 : 58, minWidth: 48, opacity: disabled ? 0.4 : 1, paddingHorizontal: compact ? spacing.sm : spacing.md, paddingVertical: spacing.sm })}>
      {icon ? <MaterialIcons color={selected ? colors.onBrand : danger ? colors.danger : colors.text} importantForAccessibility="no" name={icon} size={20} /> : null}
      <Text style={[typography.label, { color: selected ? colors.onBrand : danger ? colors.danger : colors.text, flexShrink: 1, textAlign: 'center' }]}>{label}</Text>
      {selected ? <MaterialIcons color={colors.onBrand} importantForAccessibility="no" name="check" size={18} /> : null}
    </Pressable></Animated.View>
  );
}
