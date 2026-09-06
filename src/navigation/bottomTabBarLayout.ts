export const MIN_TAB_BAR_CONTENT_HEIGHT = 64;

const FIXED_TAB_BAR_CONTENT_HEIGHT = 40;
const TAB_LABEL_LINE_HEIGHT = 16;

function finiteAtLeast(value: number, minimum: number): number {
  return Number.isFinite(value) ? Math.max(minimum, value) : minimum;
}

export function computeBottomTabBarHeight(fontScale: number, bottomInset: number): number {
  const scale = finiteAtLeast(fontScale, 1);
  const inset = finiteAtLeast(bottomInset, 0);
  const contentHeight = Math.max(
    MIN_TAB_BAR_CONTENT_HEIGHT,
    Math.ceil(FIXED_TAB_BAR_CONTENT_HEIGHT + TAB_LABEL_LINE_HEIGHT * scale),
  );

  return contentHeight + inset;
}

