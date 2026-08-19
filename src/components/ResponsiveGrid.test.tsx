import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet, Text, useWindowDimensions } from 'react-native';

import { computeGridColumns, ResponsiveGrid } from './ResponsiveGrid';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn() }));

const mockWindowDimensions = useWindowDimensions as jest.MockedFunction<typeof useWindowDimensions>;

describe('ResponsiveGrid', () => {
  beforeEach(() => {
    mockWindowDimensions.mockReturnValue({ width: 360, height: 800, scale: 3, fontScale: 1 });
  });

  it('reduces columns as width and text scale require', () => {
    expect(computeGridColumns(280, 140, 8, 1)).toBe(1);
    expect(computeGridColumns(320, 150, 8, 1)).toBe(2);
    expect(computeGridColumns(320, 150, 8, 1.5)).toBe(1);
    expect(computeGridColumns(320, 150, 8, 2)).toBe(1);
    expect(computeGridColumns(320, 140, 8, 1.5)).toBe(2);
    expect(computeGridColumns(320, 140, 8, 2)).toBe(1);
    expect(computeGridColumns(325, 100, 8, 1)).toBe(3);
    expect(computeGridColumns(325, 100, 8, 1.5)).toBe(2);
    expect(computeGridColumns(0, 150, 8, 1)).toBe(1);
    expect(computeGridColumns(1000, 80, 8, 1, 4)).toBe(4);
  });

  it('starts in one column, measures cells, and adapts after rotation', async () => {
    const view = await render(<ResponsiveGrid minItemWidth={150} testID="grid"><Text>One</Text><Text>Two</Text><Text>Three</Text></ResponsiveGrid>);
    expect(StyleSheet.flatten(view.getByTestId('grid-cell-0').props.style).flex).toBe(1);

    fireEvent(view.getByTestId('grid'), 'layout', { nativeEvent: { layout: { width: 320 } } });
    await waitFor(() => expect(StyleSheet.flatten(view.getByTestId('grid-cell-0').props.style).width).toBe(156));
    expect(StyleSheet.flatten(view.getByTestId('grid-cell-2').props.style).width).toBe(156);

    fireEvent(view.getByTestId('grid'), 'layout', { nativeEvent: { layout: { width: 640 } } });
    await waitFor(() => expect(StyleSheet.flatten(view.getByTestId('grid-cell-0').props.style).width).toBe(154));
  });

  it('keeps phone action controls in two columns at 150% text', async () => {
    mockWindowDimensions.mockReturnValue({ width: 360, height: 800, scale: 3, fontScale: 1.5 });
    const view = await render(<ResponsiveGrid minItemWidth={140} testID="actions"><Text>Double click</Text><Text>Right click</Text><Text>Start drag</Text></ResponsiveGrid>);

    fireEvent(view.getByTestId('actions'), 'layout', { nativeEvent: { layout: { width: 320 } } });
    await waitFor(() => expect(StyleSheet.flatten(view.getByTestId('actions-cell-0').props.style).width).toBe(156));
    expect(StyleSheet.flatten(view.getByTestId('actions-cell-2').props.style).width).toBe(156);
  });

  it('keeps the movement layout at exactly three columns', async () => {
    const view = await render(<ResponsiveGrid exactColumns={3} gap={10} minItemWidth={48} testID="pad">{Array.from({ length: 9 }, (_, index) => <Text key={index}>{index}</Text>)}</ResponsiveGrid>);
    fireEvent(view.getByTestId('pad'), 'layout', { nativeEvent: { layout: { width: 320 } } });
    await waitFor(() => expect(StyleSheet.flatten(view.getByTestId('pad-cell-0').props.style).width).toBe(100));
    expect(StyleSheet.flatten(view.getByTestId('pad-cell-8').props.style).width).toBe(100);
    expect(view.queryByRole('button')).toBeNull();
  });
});
