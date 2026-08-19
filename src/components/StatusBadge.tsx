import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { AppText } from './AppText';
import { useTheme } from '@/theme/ThemeContext';

type IconName = ComponentProps<typeof MaterialIcons>['name'];
type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

export function StatusBadge({ label, tone = 'neutral', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const { colors, radii, spacing } = useTheme();
  const foreground = tone === 'neutral' ? colors.textMuted : tone === 'brand' ? colors.brandText : colors[tone];
  const background = tone === 'neutral' ? colors.surfaceRaised : tone === 'brand' ? colors.brandTint : colors[`${tone}Tint`];
  return <View style={{ alignItems: 'center', alignSelf: 'flex-start', backgroundColor: background, borderRadius: radii.pill, flexDirection: 'row', flexShrink: 1, gap: spacing.xs, maxWidth: '100%', minHeight: 28, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
    <MaterialIcons color={foreground} importantForAccessibility="no" name={icon ?? 'circle'} size={icon ? 16 : 8} />
    <AppText style={{ color: foreground, flexShrink: 1 }} variant="caption">{label}</AppText>
  </View>;
}
