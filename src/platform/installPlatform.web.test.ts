/** @jest-environment jsdom */
import { AccessibilityInfo, Alert } from 'react-native';

import { installPlatform } from './installPlatform.web';

describe('web platform shims', () => {
  beforeAll(() => installPlatform());

  it('creates the live region before the first announcement', () => {
    const region = document.getElementById('switchify-live-region');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.getAttribute('role')).toBe('status');
  });

  it('announces queued messages one after another through the live region', () => {
    jest.useFakeTimers();
    try {
      const region = document.getElementById('switchify-live-region')!;
      AccessibilityInfo.announceForAccessibility('Connecting.');
      (AccessibilityInfo as unknown as { announceForAccessibilityWithOptions: (message: string, options: object) => void })
        .announceForAccessibilityWithOptions('Connected.', { queue: true });
      jest.advanceTimersByTime(60);
      expect(region.textContent).toBe('Connecting.');
      jest.advanceTimersByTime(600);
      expect(region.textContent).toBe('Connected.');
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows notices with the browser alert', () => {
    const alert = jest.spyOn(window, 'alert').mockImplementation(() => undefined);
    Alert.alert('Setup could not continue', 'Try again.');
    expect(alert).toHaveBeenCalledWith('Setup could not continue\n\nTry again.');
  });

  it('maps a cancel and an action onto a confirm that names the action', () => {
    const unpair = jest.fn();
    const keep = jest.fn();
    const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(true).mockReturnValueOnce(false);
    const buttons = [{ text: 'Cancel', style: 'cancel' as const, onPress: keep }, { text: 'Unpair', style: 'destructive' as const, onPress: unpair }];
    Alert.alert('Unpair Office?', 'This removes saved access.', buttons);
    expect(confirm).toHaveBeenLastCalledWith('Unpair Office?\n\nThis removes saved access.\n\nChoose OK to unpair.');
    expect(unpair).toHaveBeenCalledTimes(1);
    Alert.alert('Unpair Office?', 'This removes saved access.', buttons);
    expect(keep).toHaveBeenCalledTimes(1);
    expect(unpair).toHaveBeenCalledTimes(1);
  });
});
