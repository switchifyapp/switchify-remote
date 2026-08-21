import { StrictMode } from 'react';
import { AccessibilityInfo } from 'react-native';
import { render } from '@testing-library/react-native';

import type { ProfileStatus } from './profilePresentation';
import { useProfileStatusAnnouncement } from './useProfileStatusAnnouncement';

function AnnouncementHarness({ status }: { status: ProfileStatus | null }) {
  useProfileStatusAnnouncement(status);
  return null;
}

describe('pointer profile status announcements', () => {
  it('deduplicates effect replay and announces each changed transition once', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(jest.fn());
    const view = await render(<StrictMode><AnnouncementHarness status="recovering" /></StrictMode>);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenLastCalledWith('Restoring controls.', { queue: true });

    await view.rerender(<StrictMode><AnnouncementHarness status="unavailable" /></StrictMode>);
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith('Controls unavailable.', { queue: true });

    announce.mockRestore();
  });
});
