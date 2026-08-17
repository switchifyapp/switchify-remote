import { announceAccessibilityTransition } from './useAccessibilityAnnouncement';

describe('accessibility announcements', () => {
  it('announces each iOS transition once and leaves Android to live regions', () => {
    const announce = jest.fn();
    let previous: string | null = null;
    previous = announceAccessibilityTransition('ios', 'Connecting.', previous, announce);
    previous = announceAccessibilityTransition('ios', 'Connecting.', previous, announce);
    previous = announceAccessibilityTransition('ios', 'Connected.', previous, announce);
    announceAccessibilityTransition('android', 'Disconnected.', previous, announce);
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenNthCalledWith(1, 'Connecting.');
    expect(announce).toHaveBeenNthCalledWith(2, 'Connected.');
  });
});
