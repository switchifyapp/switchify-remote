import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { useLayout, useTheme } from '@/theme/ThemeContext';

type ScreenProps = PropsWithChildren<{ title: string; description?: string; headerAccessory?: ReactNode }>;

export function Screen({ title, description, headerAccessory, children }: ScreenProps) {
  const { colors, spacing } = useTheme();
  const { isExpanded } = useLayout();
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScrollView contentContainerStyle={{ alignItems: 'center', flexGrow: 1, paddingBottom: spacing.xxxl, paddingHorizontal: isExpanded ? spacing.xxl : spacing.xl }}>
        <View style={{ gap: spacing.xl, maxWidth: isExpanded ? 960 : 640, width: '100%' }}>
          <View style={{ alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <AppText accessibilityRole="header" variant="display">{title}</AppText>
              {description ? <AppText muted style={{ marginTop: spacing.xs }}>{description}</AppText> : null}
            </View>
            {headerAccessory}
          </View>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
