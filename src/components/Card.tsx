import type { PropsWithChildren } from 'react';
import { Platform, View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';

export function Card({ children, variant = 'default', style, ...props }: PropsWithChildren<ViewProps & { variant?: 'default' | 'hero' | 'danger' }>) {
  const { colors, radii, scheme, spacing } = useTheme();
  const accent = variant === 'danger' ? colors.danger : variant === 'hero' ? colors.brand : colors.border;
  return <View {...props} style={[{
    backgroundColor: colors.surface,
    borderColor: accent,
    borderRadius: radii.lg,
    borderWidth: variant === 'default' ? 1 : 2,
    gap: spacing.md,
    padding: spacing.xl,
    ...(scheme === 'light' ? Platform.select({ ios: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 10 }, android: { elevation: 2 } }) : {}),
  }, style]}>{children}</View>;
}
