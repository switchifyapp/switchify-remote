import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export function announceAccessibilityTransition(platform: string, message: string | null, previous: string | null, announce: (value: string) => void): string | null {
  if ((platform === 'ios' || platform === 'android') && message && message !== previous) announce(message);
  return message;
}

export function useAccessibilityAnnouncement(message: string | null): void {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    previous.current = announceAccessibilityTransition(Platform.OS, message, previous.current, (value) => AccessibilityInfo.announceForAccessibilityWithOptions(value, { queue: true }));
  }, [message]);
}
