import { BlurView } from 'expo-blur';
import type { RefObject } from 'react';
import { StyleSheet, View, type View as NativeView } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';

export function StickyBackdrop({ blurTarget, visible }: { blurTarget: RefObject<NativeView | null>; visible: boolean }) {
  const { colors, reducedTransparency, scheme } = useTheme();

  if (!visible) return null;

  const frame = [
    StyleSheet.absoluteFill,
    { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  ];

  if (reducedTransparency) {
    return <View testID="screen-sticky-backdrop-solid" accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[frame, { backgroundColor: colors.background }]} />;
  }

  return (
    <View testID="screen-sticky-backdrop-blur" accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[frame, { overflow: 'hidden' }]}>
      <BlurView
        blurMethod="dimezisBlurViewSdk31Plus"
        blurTarget={blurTarget}
        intensity={70}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        testID="screen-sticky-blur-view"
        tint={scheme}
      />
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: scheme === 'dark' ? 'rgba(11, 11, 13, 0.72)' : 'rgba(245, 245, 247, 0.72)' }]}
        testID="screen-sticky-backdrop-wash"
      />
    </View>
  );
}
