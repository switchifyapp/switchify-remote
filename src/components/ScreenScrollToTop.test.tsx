import { fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, ScrollView, StyleSheet } from 'react-native';

import { palettes, radii, spacing, typography } from '@/theme/tokens';
import { ControlButton } from './ControlButton';
import { Screen } from './Screen';

const mockUseTheme = jest.fn();

jest.mock('@/theme/ThemeContext', () => ({
  useLayout: () => ({ fontScale: 1, isCompact: true, isExpanded: false, isLandscape: false, isLargeText: false, isMedium: false }),
  useReducedMotionPreference: () => mockUseTheme().reducedMotion,
  useTheme: () => mockUseTheme(),
}));

function theme(reducedMotion = false) {
  return { colors: palettes.dark, radii, reducedMotion, reducedTransparency: false, scheme: 'dark' as const, spacing, typography };
}

async function renderScrollableScreen() {
  return render(
    <Screen
      bottomAccessory={<ControlButton label="Switch PC" onPress={() => undefined} />}
      scrollToTop
      stickyAccessory={<ControlButton label="Surface" onPress={() => undefined} />}
      title="Remote"
    >
      <ControlButton label="Click" onPress={() => undefined} />
    </Screen>,
  );
}

async function pinSelector(view: Awaited<ReturnType<typeof renderScrollableScreen>>) {
  const scroll = view.getByTestId('screen-scroll');
  await fireEvent(view.getByTestId('screen-sticky-accessory'), 'layout', { nativeEvent: { layout: { height: 64, width: 350, x: 0, y: 100 } } });
  await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { x: 0, y: 100 } } });
  return scroll;
}

describe('Screen scroll-to-top control', () => {
  beforeEach(() => {
    mockUseTheme.mockReturnValue(theme());
    jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined).mockClear();
  });

  afterEach(() => jest.restoreAllMocks());

  it('appears only after pinning and returns to the top once', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    const view = await renderScrollableScreen();
    const scroll = view.getByTestId('screen-scroll');

    expect(view.queryByRole('button', { name: 'Scroll to top' })).toBeNull();
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBe(80);

    await pinSelector(view);
    const button = view.getByRole('button', { name: 'Scroll to top' });
    const overlay = view.getByTestId('screen-scroll-to-top-overlay');
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({ height: 48, width: 48 });
    expect(overlay.props.accessible).toBe(false);
    expect(overlay.props.pointerEvents).toBe('box-none');
    expect(view.getByTestId('screen-scroll-to-top-icon', { includeHiddenElements: true }).props).toMatchObject({ accessible: false, importantForAccessibility: 'no' });
    expect(view.getAllByRole('button')).toHaveLength(4);

    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ animated: true, y: 0 });
    expect(view.getByRole('button', { name: 'Scroll to top' }).props.accessibilityState.disabled).toBe(true);

    await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
    expect(view.queryByRole('button', { name: 'Scroll to top' })).toBeNull();
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenCalledWith('Top of Remote', { queue: true });
  });

  it('jumps without animation when Reduce Motion is enabled', async () => {
    mockUseTheme.mockReturnValue(theme(true));
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    const view = await renderScrollableScreen();
    await pinSelector(view);

    await fireEvent.press(view.getByRole('button', { name: 'Scroll to top' }));
    expect(scrollTo).toHaveBeenCalledWith({ animated: false, y: 0 });
  });

  it('cancels pending completion when the user interrupts the scroll', async () => {
    jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    const view = await renderScrollableScreen();
    const scroll = await pinSelector(view);
    await fireEvent.press(view.getByRole('button', { name: 'Scroll to top' }));

    await fireEvent(scroll, 'scrollBeginDrag');
    expect(view.getByRole('button', { name: 'Scroll to top' }).props.accessibilityState.disabled).toBe(false);
    await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).not.toHaveBeenCalled();
  });

  it('recomputes visibility after relayout and unmounts safely during a pending scroll', async () => {
    jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    const view = await renderScrollableScreen();
    await pinSelector(view);
    expect(view.getByRole('button', { name: 'Scroll to top' })).toBeTruthy();

    await fireEvent(view.getByTestId('screen-sticky-accessory'), 'layout', { nativeEvent: { layout: { height: 96, width: 700, x: 0, y: 140 } } });
    expect(view.queryByRole('button', { name: 'Scroll to top' })).toBeNull();
    await fireEvent.scroll(view.getByTestId('screen-scroll'), { nativeEvent: { contentOffset: { x: 0, y: 150 } } });
    await fireEvent.press(view.getByRole('button', { name: 'Scroll to top' }));
    await view.unmount();
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).not.toHaveBeenCalled();
  });
});
