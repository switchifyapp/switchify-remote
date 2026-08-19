export const palettes = {
  dark: {
    background: '#0B0B0D', surface: '#17171A', surfaceRaised: '#232327', surfacePressed: '#2C2C31',
    border: '#2E2E33', borderStrong: '#46464D', text: '#F7F7F8', textMuted: '#B4B4BE',
    brand: '#D90429', brandPressed: '#B00020', brandText: '#FF5C77', brandTint: '#2A1218',
    success: '#4ADE80', successTint: '#12291B', warning: '#FBBF24', warningTint: '#2B230D',
    danger: '#FB7185', dangerTint: '#2C151A', onBrand: '#FFFFFF', shadow: '#000000',
  },
  light: {
    background: '#F5F5F7', surface: '#FFFFFF', surfaceRaised: '#FFFFFF', surfacePressed: '#ECECF0',
    border: '#DDDDE3', borderStrong: '#B9B9C2', text: '#19191E', textMuted: '#56565F',
    brand: '#D90429', brandPressed: '#A50320', brandText: '#B80322', brandTint: '#FBE9EC',
    success: '#047857', successTint: '#EAF7EF', warning: '#92400E', warningTint: '#FFF4DE',
    danger: '#BE123C', dangerTint: '#FDECEE', onBrand: '#FFFFFF', shadow: '#18181B',
  },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radii = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' as const },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  label: { fontSize: 16, lineHeight: 20, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
  code: { fontSize: 36, lineHeight: 44, fontWeight: '700' as const, letterSpacing: 4, fontVariant: ['tabular-nums'] as const },
} as const;

export type AppColors = typeof palettes.dark | typeof palettes.light;
