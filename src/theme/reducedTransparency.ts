import { AccessibilityInfo } from 'react-native';

export function subscribeReducedTransparency(onChange: (enabled: boolean) => void): () => void {
  void AccessibilityInfo.isReduceTransparencyEnabled().then(onChange);
  const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', onChange);
  return () => subscription.remove();
}
