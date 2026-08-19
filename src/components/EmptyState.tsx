import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps, ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from './AppText';
import { Card } from './Card';
import { useTheme } from '@/theme/ThemeContext';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export function EmptyState({ title, body, icon = 'info-outline', action }: { title: string; body: string; icon?: IconName; action?: ReactNode }) {
  const { colors, radii, spacing } = useTheme();
  return (
    <Card>
      <View accessible accessibilityLabel={`${title}. ${body}`} style={{ gap: spacing.md }}>
        <View importantForAccessibility="no" style={{ alignItems: 'center', backgroundColor: colors.brandTint, borderRadius: radii.pill, height: 48, justifyContent: 'center', width: 48 }}><MaterialIcons color={colors.brandText} name={icon} size={26} /></View>
        <View importantForAccessibility="no" style={{ gap: spacing.xs }}><AppText variant="title">{title}</AppText><AppText muted>{body}</AppText></View>
      </View>
      {action}
    </Card>
  );
}
