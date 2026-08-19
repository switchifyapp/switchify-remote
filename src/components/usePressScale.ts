import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

import { useReducedMotionPreference } from '@/theme/ThemeContext';

export function usePressScale(selected = false) {
  const [scale] = useState(() => new Animated.Value(1));
  const previousSelected = useRef(selected);
  const reducedMotion = useReducedMotionPreference();
  const animate = useCallback((toValue: number) => {
    Animated.timing(scale, { duration: reducedMotion ? 0 : 120, toValue, useNativeDriver: true }).start();
  }, [reducedMotion, scale]);

  useEffect(() => {
    if (selected !== previousSelected.current) {
      previousSelected.current = selected;
      scale.setValue(reducedMotion ? 1 : 0.98);
      animate(1);
    }
  }, [animate, reducedMotion, scale, selected]);

  return { scale, pressIn: () => animate(0.98), pressOut: () => animate(1) };
}
