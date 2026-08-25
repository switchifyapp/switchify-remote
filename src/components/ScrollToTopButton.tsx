import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Animated, Pressable } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';
import { usePressScale } from './usePressScale';

export function ScrollToTopButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const { colors, radii } = useTheme();
  const press = usePressScale();

  return (
    <Animated.View style={{ height: 48, transform: [{ scale: press.scale }], width: 48 }}>
      <Pressable
        accessibilityLabel="Scroll to top"
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={press.pressIn}
        onPressOut={press.pressOut}
        style={({ pressed }) => ({
          alignItems: 'center',
          backgroundColor: pressed && !disabled ? colors.surfacePressed : colors.surfaceRaised,
          borderColor: colors.borderStrong,
          borderRadius: radii.pill,
          borderWidth: 1,
          height: 48,
          justifyContent: 'center',
          opacity: disabled ? 0.6 : 1,
          width: 48,
        })}
        testID="screen-scroll-to-top"
      >
        <MaterialIcons accessible={false} color={colors.text} importantForAccessibility="no" name="arrow-upward" size={24} testID="screen-scroll-to-top-icon" />
      </Pressable>
    </Animated.View>
  );
}
