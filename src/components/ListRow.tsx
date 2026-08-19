import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from './AppText';
import { useTheme } from '@/theme/ThemeContext';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export function ListRow({ title, description, icon, onPress }: { title: string; description?: string; icon?: IconName; onPress?: () => void }) {
  const { colors, radii, spacing } = useTheme();
  const content = <>
    {icon ? <MaterialIcons color={colors.brandText} importantForAccessibility="no" name={icon} size={22} /> : null}
    <View style={{ flex: 1 }}><AppText variant="label">{title}</AppText>{description ? <AppText muted variant="caption">{description}</AppText> : null}</View>
    {onPress ? <MaterialIcons color={colors.textMuted} importantForAccessibility="no" name="chevron-right" size={24} /> : null}
  </>;
  const style = { alignItems: 'center' as const, borderRadius: radii.md, flexDirection: 'row' as const, gap: spacing.md, minHeight: 56, padding: spacing.md };
  if (!onPress) return <View style={style}>{content}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [style, { backgroundColor: pressed ? colors.surfacePressed : 'transparent' }]}>{content}</Pressable>;
}
