import type { View } from 'react-native';

export function focusAccessibilityTarget(target: View | null): void {
  const element = target as unknown as HTMLElement | null;
  if (!element || typeof element.focus !== 'function') return;
  if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '-1');
  element.focus({ preventScroll: false });
}
