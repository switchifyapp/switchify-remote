import { screenTopPadding } from './Screen';
import { spacing } from '@/theme/tokens';

describe('screen top padding', () => {
  it('adds space above web page titles, which have no status bar inset', () => {
    expect(screenTopPadding('web', false)).toBe(spacing.xxl);
  });

  it('leaves native screens and stack-header screens unchanged', () => {
    expect(screenTopPadding('ios', false)).toBe(0);
    expect(screenTopPadding('android', false)).toBe(0);
    expect(screenTopPadding('web', true)).toBe(0);
  });
});
