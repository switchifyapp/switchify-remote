import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from './AppText';
import { useTheme } from '@/theme/ThemeContext';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export function ListRow({ title, description, icon, onPress }: { title: string; description?: string; icon?: IconName; onPress?: () => void }) {
  const { colors, radii, spacing } = useTheme();
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} style={({ pressed }) => ({ alignItems: 'center', backgroundColor: pressed ? colors.surfacePressed : 'transparent', borderRadius: radii.md, flexDirection: 'row', gap: spacing.md, minHeight: 56, padding: spacing.md })}>
    {icon ? <MaterialIcons color={colors.brandText} importantForAccessibility="no" name={icon} size={22} /> : null}
    <View style={{ flex: 1 }}><AppText variant="label">{title}</AppText>{description ? <AppText muted variant="caption">{description}</AppText> : null}</View>
    {onPress ? <MaterialIcons color={colors.textMuted} importantForAccessibility="no" name="chevron-right" size={24} /> : null}
  </Pressable>;
}
