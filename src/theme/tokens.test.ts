import { classifyLayout } from './ThemeContext';
import { palettes } from './tokens';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255).map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (lighter! + 0.05) / (darker! + 0.05);
}

describe('theme', () => {
  it.each(['dark', 'light'] as const)('%s palette keeps text contrast at 4.5:1 or better', (scheme) => {
    const colors = palettes[scheme];
    expect(contrast(colors.text, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textMuted, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.onBrand, colors.brand)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.brandText, colors.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('classifies phone, landscape, and tablet layouts at the documented breakpoints', () => {
    expect(classifyLayout(390, 844)).toMatchObject({ isCompact: true, isLandscape: false });
    expect(classifyLayout(700, 390)).toMatchObject({ isMedium: true, isLandscape: true });
    expect(classifyLayout(840, 1100)).toMatchObject({ isExpanded: true, isLandscape: false });
  });
});
