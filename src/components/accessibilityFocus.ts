import { AccessibilityInfo, findNodeHandle, type View } from 'react-native';

export function focusAccessibilityTarget(target: View | null): void {
  try {
    const tag = findNodeHandle(target);
    if (tag !== null) AccessibilityInfo.setAccessibilityFocus(tag);
  } catch {
    // Native focus can become unavailable while a modal is mounting or unmounting.
  }
}
