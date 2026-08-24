import { BlurTargetView } from 'expo-blur';
import { type PropsWithChildren, type ReactNode, useCallback, useRef, useState } from 'react';
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { StickyBackdrop } from './StickyBackdrop';
import { useLayout, useTheme } from '@/theme/ThemeContext';

type ScreenProps = PropsWithChildren<{
  title: string;
  description?: string;
  headerAccessory?: ReactNode;
  bottomAccessory?: ReactNode;
  nativeHeader?: boolean;
  stickyAccessory?: ReactNode;
}>;

function ScreenHeader({ description, headerAccessory, stackHeader, title }: { description: string | undefined; headerAccessory: ReactNode; stackHeader: boolean; title: string }) {
  const { spacing } = useTheme();
  return <View testID="screen-header" style={{ alignItems: 'flex-start', flexDirection: stackHeader ? 'column' : 'row', gap: stackHeader ? spacing.sm : spacing.md, justifyContent: 'space-between' }}>
    <View style={{ flex: 1 }}>
      <AppText accessibilityRole="header" variant="display">{title}</AppText>
      {description ? <AppText muted style={{ marginTop: spacing.xs }}>{description}</AppText> : null}
    </View>
    {headerAccessory ? <View style={{ flexShrink: 1 }}>{headerAccessory}</View> : null}
  </View>;
}

type StickyScreenContentProps = PropsWithChildren<{
  description: string | undefined;
  headerAccessory: ReactNode;
  isExpanded: boolean;
  nativeHeader: boolean;
  paddingBottom: number;
  paddingHorizontal: number;
  stackHeader: boolean;
  stickyAccessory: ReactNode;
  title: string;
}>;

function StickyScreenContent({ children, description, headerAccessory, isExpanded, nativeHeader, paddingBottom, paddingHorizontal, stackHeader, stickyAccessory, title }: StickyScreenContentProps) {
  const { spacing } = useTheme();
  const [pinned, setPinned] = useState(false);
  const blurTarget = useRef<View>(null);
  const pinnedRef = useRef(false);
  const scrollOffsetRef = useRef(0);
  const stickyTopRef = useRef<number | null>(null);
  const maxWidth = isExpanded ? 960 : 640;

  const updatePinned = useCallback(() => {
    if (stickyTopRef.current === null) return;
    const nextPinned = scrollOffsetRef.current >= stickyTopRef.current - 1;
    if (nextPinned === pinnedRef.current) return;
    pinnedRef.current = nextPinned;
    setPinned(nextPinned);
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
    updatePinned();
  }, [updatePinned]);

  return <ScrollView
    testID="screen-scroll"
    contentContainerStyle={{ alignItems: 'center', flexGrow: 1, gap: spacing.md, paddingBottom, paddingHorizontal }}
    onScroll={handleScroll}
    scrollEventThrottle={16}
    stickyHeaderIndices={[1]}
  >
    <View testID="screen-sticky-header-content" style={{ maxWidth, width: '100%' }}>
      {!nativeHeader ? <ScreenHeader description={description} headerAccessory={headerAccessory} stackHeader={stackHeader} title={title} /> : null}
    </View>
    <View
      testID="screen-sticky-accessory"
      onLayout={(event) => {
        stickyTopRef.current = event.nativeEvent.layout.y;
        updatePinned();
      }}
      style={{ maxWidth, paddingVertical: spacing.sm, width: '100%' }}
    >
      <StickyBackdrop blurTarget={blurTarget} visible={pinned} />
      {stickyAccessory}
    </View>
    <BlurTargetView ref={blurTarget} testID="screen-content" style={{ gap: spacing.xl, maxWidth, width: '100%' }}>
      {children}
    </BlurTargetView>
  </ScrollView>;
}

export function Screen({ title, description, headerAccessory, bottomAccessory, nativeHeader = false, stickyAccessory, children }: ScreenProps) {
  const { colors, spacing } = useTheme();
  const { isCompact, isExpanded, isLargeText } = useLayout();
  const insets = useSafeAreaInsets();
  const stackHeader = isCompact || isLargeText;
  const paddingBottom = bottomAccessory ? spacing.xl : spacing.xxxl + insets.bottom;
  const paddingHorizontal = isExpanded ? spacing.xxl : spacing.xl;
  return (
    <SafeAreaView edges={nativeHeader ? [] : ['top']} style={{ backgroundColor: colors.background, flex: 1 }}>
      {stickyAccessory === undefined ? <ScrollView testID="screen-scroll" contentContainerStyle={{ alignItems: 'center', flexGrow: 1, paddingBottom, paddingHorizontal }}>
        <View testID="screen-content" style={{ gap: spacing.xl, maxWidth: isExpanded ? 960 : 640, paddingTop: nativeHeader ? spacing.xl : 0, width: '100%' }}>
          {!nativeHeader ? <ScreenHeader description={description} headerAccessory={headerAccessory} stackHeader={stackHeader} title={title} /> : null}
          {children}
        </View>
      </ScrollView> : <StickyScreenContent
        description={description}
        headerAccessory={headerAccessory}
        isExpanded={isExpanded}
        nativeHeader={nativeHeader}
        paddingBottom={paddingBottom}
        paddingHorizontal={paddingHorizontal}
        stackHeader={stackHeader}
        stickyAccessory={stickyAccessory}
        title={title}
      >{children}</StickyScreenContent>}
      {bottomAccessory ? <View testID="screen-bottom-accessory" style={{ alignItems: 'center', backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, paddingHorizontal: isExpanded ? spacing.xxl : spacing.xl, paddingVertical: spacing.sm }}>
        <View testID="screen-bottom-accessory-content" style={{ maxWidth: isExpanded ? 960 : 640, width: '100%' }}>{bottomAccessory}</View>
      </View> : null}
    </SafeAreaView>
  );
}
