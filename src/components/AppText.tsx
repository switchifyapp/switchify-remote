import { Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'code';

export function AppText({ variant = 'body', muted = false, style, ...props }: TextProps & { variant?: Variant; muted?: boolean }) {
  const { colors, typography } = useTheme();
  return <Text {...props} style={[typography[variant] as TextStyle, { color: muted ? colors.textMuted : colors.text }, style]} />;
}
