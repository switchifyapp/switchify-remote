import { announceAccessibilityTransition } from './useAccessibilityAnnouncement';

describe('accessibility announcements', () => {
  it.each(['ios', 'android'])('announces each %s transition once', (platform) => {
    const announce = jest.fn();
    let previous: string | null = null;
    previous = announceAccessibilityTransition(platform, 'Connecting.', previous, announce);
    previous = announceAccessibilityTransition(platform, 'Connecting.', previous, announce);
    announceAccessibilityTransition(platform, 'Approve pairing. Verification code 1 2 3 4 5 6.', previous, announce);
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenNthCalledWith(1, 'Connecting.');
    expect(announce).toHaveBeenNthCalledWith(2, 'Approve pairing. Verification code 1 2 3 4 5 6.');
  });

  it('does not announce on unsupported platforms', () => {
    const announce = jest.fn();
    announceAccessibilityTransition('web', 'Connected.', null, announce);
    expect(announce).not.toHaveBeenCalled();
  });
});
