import type { ReactNode } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps } from 'react-native';

import { ScanItemHighlight } from '@/scanning/ScanHighlight';
import { useScannable } from '@/scanning/useScannable';
import { useTheme } from '@/theme/ThemeContext';

type TabButtonProps = Omit<PressableProps, 'children' | 'onPress'> & {
  children?: ReactNode;
  href?: string | undefined;
  onPress?: ((event: GestureResponderEvent) => void) | undefined;
};

/**
 * A tab bar button that scanning can reach. The navigator's press handler ignores
 * its event, so a scan selection calls it without one.
 */
export function ScannableTabButton({ children, onPress, style, ...rest }: TabButtonProps) {
  const { radii } = useTheme();
  const { attach: scanAttach, onLayout: scanLayout, highlighted: scanHighlighted, groupHighlighted: scanGroupHighlighted } = useScannable({ onActivate: onPress ? () => onPress(undefined as unknown as GestureResponderEvent) : undefined });
  return <Pressable {...rest} ref={scanAttach} onLayout={scanLayout} onPress={onPress} style={style}>
    {(state) => <>
      {typeof children === 'function' ? (children as (pressed: typeof state) => ReactNode)(state) : children}
      <ScanItemHighlight highlighted={scanHighlighted} groupHighlighted={scanGroupHighlighted} radius={radii.md} />
    </>}
  </Pressable>;
}
