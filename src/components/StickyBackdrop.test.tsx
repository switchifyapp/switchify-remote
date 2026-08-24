import { render } from '@testing-library/react-native';
import { StyleSheet, type View } from 'react-native';
import type { RefObject } from 'react';

import { palettes, radii, spacing, typography } from '@/theme/tokens';
import { StickyBackdrop } from './StickyBackdrop';

const mockUseTheme = jest.fn();

jest.mock('@/theme/ThemeContext', () => ({
  useTheme: () => mockUseTheme(),
}));

const blurTarget = { current: null } as RefObject<View | null>;

function theme(scheme: 'dark' | 'light', reducedTransparency = false) {
  return { colors: palettes[scheme], radii, reducedMotion: false, reducedTransparency, scheme, spacing, typography };
}

describe('StickyBackdrop', () => {
  beforeEach(() => mockUseTheme.mockReturnValue(theme('dark')));

  it('renders nothing before content reaches the sticky selector', async () => {
    const view = await render(<StickyBackdrop blurTarget={blurTarget} visible={false} />);
    expect(view.toJSON()).toBeNull();
  });

  it('uses the Android 12+ blur method, target, and dark wash', async () => {
    const view = await render(<StickyBackdrop blurTarget={blurTarget} visible />);
    const blur = view.getByTestId('screen-sticky-blur-view', { includeHiddenElements: true });
    expect(blur.props.blurMethod).toBe('dimezisBlurViewSdk31Plus');
    expect(blur.props.blurTarget).toBe(blurTarget);
    expect(blur.props.intensity).toBe(70);
    expect(blur.props.tint).toBe('dark');
    expect(blur.props.pointerEvents).toBe('none');
    expect(StyleSheet.flatten(view.getByTestId('screen-sticky-backdrop-wash', { includeHiddenElements: true }).props.style).backgroundColor).toBe('rgba(11, 11, 13, 0.72)');
  });

  it('uses the light tint and wash with the light theme', async () => {
    mockUseTheme.mockReturnValue(theme('light'));
    const view = await render(<StickyBackdrop blurTarget={blurTarget} visible />);
    expect(view.getByTestId('screen-sticky-blur-view', { includeHiddenElements: true }).props.tint).toBe('light');
    expect(StyleSheet.flatten(view.getByTestId('screen-sticky-backdrop-wash', { includeHiddenElements: true }).props.style).backgroundColor).toBe('rgba(245, 245, 247, 0.72)');
  });

  it('uses an opaque, non-interactive fallback when transparency is reduced', async () => {
    mockUseTheme.mockReturnValue(theme('dark', true));
    const view = await render(<StickyBackdrop blurTarget={blurTarget} visible />);
    const fallback = view.getByTestId('screen-sticky-backdrop-solid', { includeHiddenElements: true });
    expect(view.queryByTestId('screen-sticky-blur-view', { includeHiddenElements: true })).toBeNull();
    expect(fallback.props.accessible).toBe(false);
    expect(fallback.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(fallback.props.pointerEvents).toBe('none');
    expect(StyleSheet.flatten(fallback.props.style)).toMatchObject({
      backgroundColor: palettes.dark.background,
      borderBottomColor: palettes.dark.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    });
  });
});
