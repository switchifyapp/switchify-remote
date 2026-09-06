import { computeBottomTabBarHeight, MIN_TAB_BAR_CONTENT_HEIGHT } from './bottomTabBarLayout';

describe('computeBottomTabBarHeight', () => {
  it.each([
    [1, 0, 64],
    [1.5, 0, 64],
    [2, 0, 72],
    [3, 0, 88],
    [2, 24, 96],
  ])('uses font scale %s and bottom inset %s to produce %s points', (fontScale, bottomInset, expected) => {
    expect(computeBottomTabBarHeight(fontScale, bottomInset)).toBe(expected);
  });

  it('keeps the minimum content height below 100% text scaling', () => {
    expect(computeBottomTabBarHeight(0.8, 0)).toBe(MIN_TAB_BAR_CONTENT_HEIGHT);
  });

  it('falls back safely for invalid measurements', () => {
    expect(computeBottomTabBarHeight(Number.NaN, Number.NaN)).toBe(MIN_TAB_BAR_CONTENT_HEIGHT);
    expect(computeBottomTabBarHeight(Number.POSITIVE_INFINITY, -10)).toBe(MIN_TAB_BAR_CONTENT_HEIGHT);
  });
});

