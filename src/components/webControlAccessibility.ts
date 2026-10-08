/** Native state/value props are not forwarded by React Native Web. */
export function webControlAccessibility(platform: string, { label, value, selected, disabled, busy, expanded, role = 'button' }: {
  label?: string;
  value?: string;
  selected?: boolean | undefined;
  disabled?: boolean;
  busy?: boolean;
  expanded?: boolean;
  role?: string;
}) {
  if (platform !== 'web') return {};
  return {
    ...(label !== undefined && value !== undefined ? { 'aria-label': `${label}: ${value}` } : {}),
    ...(selected !== undefined ? role === 'button' ? { 'aria-pressed': selected } : { 'aria-selected': selected } : {}),
    ...(disabled !== undefined ? { 'aria-disabled': disabled } : {}),
    ...(busy !== undefined ? { 'aria-busy': busy } : {}),
    ...(expanded !== undefined ? { 'aria-expanded': expanded } : {}),
  };
}
