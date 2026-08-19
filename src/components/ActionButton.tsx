import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Animated, Pressable, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
import { usePressScale } from './usePressScale';

type Tone = 'primary' | 'secondary' | 'tertiary' | 'danger';
type IconName = ComponentProps<typeof MaterialIcons>['name'];

export function ActionButton({ label, onPress, disabled = false, busy = false, secondary = false, tone, icon }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; secondary?: boolean; tone?: Tone; icon?: IconName }) {
  const { colors, radii, spacing, typography } = useTheme();
  const press = usePressScale();
  const resolvedTone = tone ?? (secondary ? 'secondary' : 'primary');
  const background = resolvedTone === 'primary' ? colors.brand : resolvedTone === 'danger' ? colors.dangerTint : resolvedTone === 'secondary' ? colors.surfaceRaised : 'transparent';
  const foreground = resolvedTone === 'primary' ? colors.onBrand : resolvedTone === 'danger' ? colors.danger : resolvedTone === 'tertiary' ? colors.brandText : colors.text;
  return (
    <Animated.View style={{ transform: [{ scale: press.scale }], width: '100%' }}><Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress} onPressIn={press.pressIn} onPressOut={press.pressOut} style={({ pressed }) => ({ alignItems: 'center', backgroundColor: pressed && !disabled ? (resolvedTone === 'primary' ? colors.brandPressed : colors.surfacePressed) : background, borderColor: resolvedTone === 'tertiary' ? 'transparent' : resolvedTone === 'danger' ? colors.danger : colors.border, borderRadius: radii.md, borderWidth: resolvedTone === 'primary' ? 0 : 1, justifyContent: 'center', minHeight: 52, opacity: disabled ? 0.4 : 1, paddingHorizontal: spacing.lg })}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
        {busy ? <ActivityIndicator color={foreground} /> : icon ? <MaterialIcons color={foreground} importantForAccessibility="no" name={icon} size={20} /> : null}
        <Text style={[typography.label, { color: foreground }]}>{label}</Text>
      </View>
    </Pressable></Animated.View>
  );
}
