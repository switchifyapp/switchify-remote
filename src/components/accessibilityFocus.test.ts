import { AccessibilityInfo, findNodeHandle } from 'react-native';

import { focusAccessibilityTarget } from './accessibilityFocus';

jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  findNodeHandle: jest.fn(),
}));

describe('focusAccessibilityTarget', () => {
  it('forwards a resolved native tag', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    (findNodeHandle as jest.Mock).mockReturnValue(42);

    focusAccessibilityTarget({} as never);

    expect(focus).toHaveBeenCalledWith(42);
  });

  it('ignores unavailable and failing native targets', () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    focus.mockClear();
    (findNodeHandle as jest.Mock).mockReturnValue(null);
    expect(() => focusAccessibilityTarget(null)).not.toThrow();
    expect(focus).not.toHaveBeenCalled();

    (findNodeHandle as jest.Mock).mockImplementation(() => { throw new Error('unmounted'); });
    expect(() => focusAccessibilityTarget({} as never)).not.toThrow();
  });
});
