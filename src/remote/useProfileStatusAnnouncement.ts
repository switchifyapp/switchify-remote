import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { announceAccessibilityTransition } from '@/components/useAccessibilityAnnouncement';
import { profileStatusAnnouncement, type ProfileStatus } from './profilePresentation';

export function useProfileStatusAnnouncement(status: ProfileStatus | null): void {
  const previous = useRef<ProfileStatus | null>(null);
  const previousAnnouncement = useRef<string | null>(null);
  useEffect(() => {
    const message = profileStatusAnnouncement(status, previous.current);
    previousAnnouncement.current = announceAccessibilityTransition(Platform.OS, message, previousAnnouncement.current, (value) => AccessibilityInfo.announceForAccessibilityWithOptions(value, { queue: true }));
    previous.current = status;
  }, [status]);
}
