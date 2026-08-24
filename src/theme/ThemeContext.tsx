import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, useColorScheme, useWindowDimensions } from 'react-native';

import { palettes, radii, spacing, typography } from './tokens';

type ThemeValue = {
  colors: typeof palettes.dark | typeof palettes.light;
  radii: typeof radii;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  scheme: 'dark' | 'light';
  spacing: typeof spacing;
  typography: typeof typography;
};

const defaultTheme: ThemeValue = { colors: palettes.dark, radii, reducedMotion: false, reducedTransparency: false, scheme: 'dark', spacing, typography };
const ThemeContext = createContext<ThemeValue>(defaultTheme);

export function ThemeProvider({ children }: PropsWithChildren) {
  const scheme: 'light' | 'dark' = useColorScheme() === 'light' ? 'light' : 'dark';
  const [reducedMotion, setReducedMotion] = useState(false);
  const [reducedTransparency, setReducedTransparency] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReducedTransparency);
    const motionSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    const transparencySubscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReducedTransparency);
    return () => {
      motionSubscription.remove();
      transparencySubscription.remove();
    };
  }, []);
  const value = useMemo(() => ({ colors: palettes[scheme], radii, reducedMotion, reducedTransparency, scheme, spacing, typography }), [reducedMotion, reducedTransparency, scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

export function useLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  return classifyLayout(width, height, fontScale);
}

export function classifyLayout(width: number, height: number, fontScale = 1) {
  return {
    isCompact: width < 600,
    isMedium: width >= 600 && width < 840,
    isExpanded: width >= 840,
    isLandscape: width > height,
    isLargeText: fontScale >= 1.5,
    fontScale,
  };
}

export function shouldUseTwoColumns(layout: ReturnType<typeof classifyLayout>): boolean {
  return !layout.isCompact && !layout.isLargeText;
}

export function useReducedMotionPreference(): boolean {
  return useTheme().reducedMotion;
}
