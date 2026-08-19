import { Children, type ReactNode, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useLayout, useTheme } from '@/theme/ThemeContext';

export function computeGridColumns(width: number, minItemWidth: number, gap: number, fontScale: number, maxColumns = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isFinite(width) || width <= 0) return 1;
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? Math.max(1, fontScale) : 1;
  const effectiveMinimum = Math.round(minItemWidth * scale);
  return Math.max(1, Math.min(maxColumns, Math.floor((width + gap) / (effectiveMinimum + gap))));
}

export function ResponsiveGrid({ minItemWidth, gap: gapOverride, maxColumns = Number.MAX_SAFE_INTEGER, exactColumns, children, testID }: {
  minItemWidth: number;
  gap?: number;
  maxColumns?: number;
  exactColumns?: number;
  children: ReactNode;
  testID?: string;
}) {
  const { fontScale } = useLayout();
  const { spacing } = useTheme();
  const gap = gapOverride ?? spacing.sm;
  const [width, setWidth] = useState(0);
  const items = Children.toArray(children);
  const columns = exactColumns ?? computeGridColumns(width, minItemWidth, gap, fontScale, maxColumns);
  const rows = useMemo(() => {
    const result: ReactNode[][] = [];
    for (let index = 0; index < items.length; index += columns) result.push(items.slice(index, index + columns));
    return result;
  }, [columns, items]);
  const cellWidth = width > 0 ? Math.max(0, (width - gap * (columns - 1)) / columns) : null;

  return <View testID={testID} onLayout={(event) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((current) => current === next ? current : next);
  }} style={{ gap }}>
    {rows.map((row, rowIndex) => <View key={rowIndex} style={{ alignItems: 'stretch', flexDirection: 'row', gap }}>
      {row.map((item, columnIndex) => <View key={`${rowIndex}-${columnIndex}`} testID={testID ? `${testID}-cell-${rowIndex * columns + columnIndex}` : undefined} style={cellWidth === null ? { flex: 1, minWidth: 0 } : { minWidth: 0, width: cellWidth }}>{item}</View>)}
    </View>)}
  </View>;
}
