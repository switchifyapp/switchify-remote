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
