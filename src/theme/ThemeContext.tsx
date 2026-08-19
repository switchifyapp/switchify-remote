import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, useColorScheme, useWindowDimensions } from 'react-native';

import { palettes, radii, spacing, typography } from './tokens';

type ThemeValue = {
  colors: typeof palettes.dark | typeof palettes.light;
  radii: typeof radii;
  reducedMotion: boolean;
  scheme: 'dark' | 'light';
  spacing: typeof spacing;
  typography: typeof typography;
};

const defaultTheme: ThemeValue = { colors: palettes.dark, radii, reducedMotion: false, scheme: 'dark', spacing, typography };
const ThemeContext = createContext<ThemeValue>(defaultTheme);

export function ThemeProvider({ children }: PropsWithChildren) {
  const scheme: 'light' | 'dark' = useColorScheme() === 'light' ? 'light' : 'dark';
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => subscription.remove();
  }, []);
  const value = useMemo(() => ({ colors: palettes[scheme], radii, reducedMotion, scheme, spacing, typography }), [reducedMotion, scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

export function useLayout() {
  const { width, height } = useWindowDimensions();
  return classifyLayout(width, height);
}

export function classifyLayout(width: number, height: number) {
  return {
    isCompact: width < 600,
    isMedium: width >= 600 && width < 840,
    isExpanded: width >= 840,
    isLandscape: width > height,
  };
}

export function useReducedMotionPreference(): boolean {
  return useTheme().reducedMotion;
}
