import { BlurTargetView } from 'expo-blur';
import { type PropsWithChildren, type ReactNode, useCallback, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, View, type NativeScrollEvent, type ScrollViewProps, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { ScrollToTopButton } from './ScrollToTopButton';
import { StickyBackdrop } from './StickyBackdrop';
import { useLayout, useTheme } from '@/theme/ThemeContext';

type ScreenProps = PropsWithChildren<{
  title: string;
  description?: string;
  headerAccessory?: ReactNode;
  bottomAccessory?: ReactNode;
  nativeHeader?: boolean;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  scrollToTop?: boolean;
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
  keyboardShouldPersistTaps: ScrollViewProps['keyboardShouldPersistTaps'];
  paddingBottom: number;
  paddingHorizontal: number;
  scrollToTop: boolean;
  stackHeader: boolean;
  stickyAccessory: ReactNode;
  title: string;
}>;

function StickyScreenContent({ children, description, headerAccessory, isExpanded, nativeHeader, keyboardShouldPersistTaps, paddingBottom, paddingHorizontal, scrollToTop, stackHeader, stickyAccessory, title }: StickyScreenContentProps) {
  const { reducedMotion, spacing } = useTheme();
  const [pinned, setPinned] = useState(false);
  const [scrollingToTop, setScrollingToTop] = useState(false);
  const blurTarget = useRef<View>(null);
  const pinnedRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const scrollToTopPendingRef = useRef(false);
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
    if (scrollToTopPendingRef.current && scrollOffsetRef.current <= 1) {
      scrollToTopPendingRef.current = false;
      setScrollingToTop(false);
      AccessibilityInfo.announceForAccessibilityWithOptions('Top of Remote', { queue: true });
    }
  }, [updatePinned]);

  const cancelScrollToTop = useCallback(() => {
    if (!scrollToTopPendingRef.current) return;
    scrollToTopPendingRef.current = false;
    setScrollingToTop(false);
  }, []);

  const handleScrollToTop = useCallback(() => {
    if (scrollToTopPendingRef.current || scrollRef.current === null) return;
    scrollToTopPendingRef.current = true;
    setScrollingToTop(true);
    scrollRef.current.scrollTo({ animated: !reducedMotion, y: 0 });
  }, [reducedMotion]);

  const scrollView = <ScrollView
    ref={scrollRef}
    testID="screen-scroll"
    keyboardShouldPersistTaps={keyboardShouldPersistTaps}
    contentContainerStyle={{ alignItems: 'center', flexGrow: 1, gap: spacing.md, paddingBottom: paddingBottom + (scrollToTop ? 48 + spacing.md : 0), paddingHorizontal }}
    onScroll={handleScroll}
    onScrollBeginDrag={scrollToTop ? cancelScrollToTop : undefined}
    onTouchStart={scrollToTop ? cancelScrollToTop : undefined}
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

  if (!scrollToTop) return scrollView;

  return <View style={{ flex: 1 }} testID="screen-scroll-to-top-container">
    {scrollView}
    {pinned ? <View accessible={false} pointerEvents="box-none" style={{ alignItems: 'center', bottom: 0, left: 0, position: 'absolute', right: 0 }} testID="screen-scroll-to-top-overlay">
      <View accessible={false} pointerEvents="box-none" style={{ alignItems: 'flex-end', maxWidth, paddingBottom: spacing.md, paddingHorizontal, width: '100%' }}>
        <ScrollToTopButton disabled={scrollingToTop} onPress={handleScrollToTop} />
      </View>
    </View> : null}
  </View>;
}

export function Screen({ title, description, headerAccessory, bottomAccessory, nativeHeader = false, scrollToTop = false, stickyAccessory, keyboardShouldPersistTaps, children }: ScreenProps) {
  const { colors, spacing } = useTheme();
  const { isCompact, isExpanded, isLargeText } = useLayout();
  const insets = useSafeAreaInsets();
  const stackHeader = isCompact || isLargeText;
  const paddingBottom = bottomAccessory ? spacing.xl : spacing.xxxl + insets.bottom;
  const paddingHorizontal = isExpanded ? spacing.xxl : spacing.xl;
  return (
    <SafeAreaView edges={nativeHeader ? [] : ['top']} style={{ backgroundColor: colors.background, flex: 1 }}>
      {stickyAccessory === undefined ? <ScrollView testID="screen-scroll" keyboardShouldPersistTaps={keyboardShouldPersistTaps} contentContainerStyle={{ alignItems: 'center', flexGrow: 1, paddingBottom, paddingHorizontal }}>
        <View testID="screen-content" style={{ gap: spacing.xl, maxWidth: isExpanded ? 960 : 640, paddingTop: nativeHeader ? spacing.xl : 0, width: '100%' }}>
          {!nativeHeader ? <ScreenHeader description={description} headerAccessory={headerAccessory} stackHeader={stackHeader} title={title} /> : null}
          {children}
        </View>
      </ScrollView> : <StickyScreenContent
        description={description}
        headerAccessory={headerAccessory}
        isExpanded={isExpanded}
        nativeHeader={nativeHeader}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        paddingBottom={paddingBottom}
        paddingHorizontal={paddingHorizontal}
        scrollToTop={scrollToTop}
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
