import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ControlButton } from './ControlButton';
import { ListRow } from './ListRow';
import { Screen } from './Screen';
import { StatusBadge } from './StatusBadge';

describe('accessibility primitives', () => {
  it('exposes role, selected state, and a minimum 48 point target', async () => {
    const view = await render(<ControlButton label="Mouse" role="tab" selected onPress={() => undefined} />);
    const control = view.getByRole('tab', { name: 'Mouse', selected: true });
    const style = StyleSheet.flatten(control.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
    expect(view.getByText('Mouse').props.numberOfLines).toBeUndefined();
  });

  it('keeps content in one labelled, scrollable screen hierarchy', async () => {
    const view = await render(<Screen title="Remote" description="Connected to Office"><ControlButton label="Click" onPress={() => undefined} /></Screen>);
    expect(view.getByRole('header')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Click' })).toBeTruthy();
    expect(view.getByTestId('screen-scroll').props.stickyHeaderIndices).toBeUndefined();
    expect(view.getByTestId('screen-scroll').props.onScroll).toBeUndefined();
    expect(view.queryByTestId('screen-sticky-accessory')).toBeNull();
  });

  it('pins a supplied accessory without adding scanning stops', async () => {
    const view = await render(<Screen title="Remote" stickyAccessory={<ControlButton label="Surface" onPress={() => undefined} />} bottomAccessory={<ControlButton label="Choose PC" onPress={() => undefined} />}><ControlButton label="Click" onPress={() => undefined} /></Screen>);
    const scroll = view.getByTestId('screen-scroll');
    const header = view.getByTestId('screen-sticky-header-content');
    const sticky = view.getByTestId('screen-sticky-accessory');
    const content = view.getByTestId('screen-content');

    expect(scroll.props.stickyHeaderIndices).toEqual([1]);
    expect(scroll.props.scrollEventThrottle).toBe(16);
    expect(header.parent).toBe(sticky.parent);
    expect(sticky.parent).toBe(content.parent);
    expect(header.parent?.children).toEqual([header, sticky, content]);
    expect(view.queryByTestId('screen-sticky-backdrop-blur')).toBeNull();
    expect(view.getAllByRole('button')).toHaveLength(3);
    expect(view.getByTestId('screen-scroll').parent?.props.children[1].props.testID).toBe('screen-bottom-accessory');

    await fireEvent(view.getByTestId('screen-sticky-accessory'), 'layout', { nativeEvent: { layout: { height: 64, width: 350, x: 0, y: 100 } } });
    await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { x: 0, y: 99 } } });
    expect(view.queryByTestId('screen-sticky-backdrop-blur')).toBeNull();
    await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { x: 0, y: 100 } } });
    expect(view.getByTestId('screen-sticky-backdrop-blur', { includeHiddenElements: true })).toBeTruthy();
    expect(view.getAllByRole('button')).toHaveLength(3);

    await fireEvent(view.getByTestId('screen-sticky-accessory'), 'layout', { nativeEvent: { layout: { height: 96, width: 350, x: 0, y: 140 } } });
    expect(view.queryByTestId('screen-sticky-backdrop-blur')).toBeNull();
    await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { x: 0, y: 150 } } });
    expect(view.getByTestId('screen-sticky-backdrop-blur', { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
    expect(view.queryByTestId('screen-sticky-backdrop-blur')).toBeNull();
  });

  it('keeps read-only status text out of switch scanning', async () => {
    const label = 'Connected to an office computer with an intentionally long localized display name';
    const view = await render(<StatusBadge label={label} tone="success" />);

    expect(view.getByText(label)).toBeTruthy();
    expect(view.queryByLabelText(label)).toBeNull();
    expect(view.queryByRole('button')).toBeNull();
  });

  it('only gives list rows button semantics when they have an action', async () => {
    const onPress = jest.fn();
    const view = await render(<><ListRow title="Pointer speed" description="35%" /><ListRow title="Diagnostics" onPress={onPress} /></>);

    expect(view.queryByRole('button', { name: 'Pointer speed' })).toBeNull();
    fireEvent.press(view.getByRole('button', { name: 'Diagnostics' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
