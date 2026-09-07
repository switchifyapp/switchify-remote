import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ComponentProps } from "react";
import { Animated, Pressable } from "react-native";
import { useTheme } from "@/theme/ThemeContext";
import { usePressScale } from "./usePressScale";

export function IconButton({
  icon,
  accessibilityLabel,
  hint,
  selected = false,
  disabled = false,
  onPress,
}: {
  icon: ComponentProps<typeof MaterialIcons>["name"];
  accessibilityLabel: string;
  hint?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors, radii } = useTheme();
  const press = usePressScale(selected);
  return (
    <Animated.View
      style={{
        width: 48,
        minHeight: 48,
        flexShrink: 0,
        transform: [{ scale: press.scale }],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={hint}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={press.pressIn}
        onPressOut={press.pressOut}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 48,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderRadius: radii.md,
          borderColor: selected ? colors.brand : colors.border,
          backgroundColor: selected
            ? colors.brand
            : pressed
              ? colors.surfacePressed
              : colors.surfaceRaised,
          opacity: disabled ? 0.4 : 1,
        })}
      >
        <MaterialIcons
          accessible={false}
          importantForAccessibility="no"
          name={icon}
          size={24}
          color={selected ? colors.onBrand : colors.text}
        />
      </Pressable>
    </Animated.View>
  );
}
