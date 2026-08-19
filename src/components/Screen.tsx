import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { useLayout, useTheme } from '@/theme/ThemeContext';

type ScreenProps = PropsWithChildren<{ title: string; description?: string; headerAccessory?: ReactNode; nativeHeader?: boolean }>;

export function Screen({ title, description, headerAccessory, nativeHeader = false, children }: ScreenProps) {
  const { colors, spacing } = useTheme();
  const { isExpanded } = useLayout();
  return (
    <SafeAreaView edges={nativeHeader ? [] : ['top']} style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScrollView contentContainerStyle={{ alignItems: 'center', flexGrow: 1, paddingBottom: spacing.xxxl, paddingHorizontal: isExpanded ? spacing.xxl : spacing.xl }}>
        <View testID="screen-content" style={{ gap: spacing.xl, maxWidth: isExpanded ? 960 : 640, paddingTop: nativeHeader ? spacing.xl : 0, width: '100%' }}>
          {!nativeHeader ? <View style={{ alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <AppText accessibilityRole="header" variant="display">{title}</AppText>
              {description ? <AppText muted style={{ marginTop: spacing.xs }}>{description}</AppText> : null}
            </View>
            {headerAccessory}
          </View> : null}
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
