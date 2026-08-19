import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { useLayout, useTheme } from '@/theme/ThemeContext';

type ScreenProps = PropsWithChildren<{ title: string; description?: string; headerAccessory?: ReactNode; nativeHeader?: boolean }>;

export function Screen({ title, description, headerAccessory, nativeHeader = false, children }: ScreenProps) {
  const { colors, spacing } = useTheme();
  const { isCompact, isExpanded, isLargeText } = useLayout();
  const insets = useSafeAreaInsets();
  const stackHeader = isCompact || isLargeText;
  return (
    <SafeAreaView edges={nativeHeader ? [] : ['top']} style={{ backgroundColor: colors.background, flex: 1 }}>
      <ScrollView testID="screen-scroll" contentContainerStyle={{ alignItems: 'center', flexGrow: 1, paddingBottom: spacing.xxxl + insets.bottom, paddingHorizontal: isExpanded ? spacing.xxl : spacing.xl }}>
        <View testID="screen-content" style={{ gap: spacing.xl, maxWidth: isExpanded ? 960 : 640, paddingTop: nativeHeader ? spacing.xl : 0, width: '100%' }}>
          {!nativeHeader ? <View testID="screen-header" style={{ alignItems: 'flex-start', flexDirection: stackHeader ? 'column' : 'row', gap: stackHeader ? spacing.sm : spacing.md, justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <AppText accessibilityRole="header" variant="display">{title}</AppText>
              {description ? <AppText muted style={{ marginTop: spacing.xs }}>{description}</AppText> : null}
            </View>
            {headerAccessory ? <View style={{ flexShrink: 1 }}>{headerAccessory}</View> : null}
          </View> : null}
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
