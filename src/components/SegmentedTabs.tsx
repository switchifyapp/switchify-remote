import { View } from 'react-native';

import { ControlButton } from './ControlButton';
import { useTheme } from '@/theme/ThemeContext';

export function SegmentedTabs<T extends string>({ items, selectedKey, onSelect }: { items: readonly { key: T; label: string }[]; selectedKey: T; onSelect: (key: T) => void }) {
  const { colors, radii, spacing } = useTheme();
  return <View accessibilityRole="tablist" style={{ backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, padding: spacing.xs }}>
    {items.map((item) => <ControlButton key={item.key} compact label={item.label} role="tab" selected={selectedKey === item.key} onPress={() => onSelect(item.key)} />)}
  </View>;
}
