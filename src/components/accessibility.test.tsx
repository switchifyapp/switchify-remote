import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ControlButton } from './ControlButton';
import { Screen } from './Screen';

describe('accessibility primitives', () => {
  it('exposes role, selected state, and a minimum 48 point target', async () => {
    const view = await render(<ControlButton label="Mouse" role="tab" selected onPress={() => undefined} />);
    const control = view.getByRole('tab', { name: 'Mouse', selected: true });
    const style = StyleSheet.flatten(control.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
  });

  it('keeps content in one labelled, scrollable screen hierarchy', async () => {
    const view = await render(<Screen title="Remote" description="Connected to Office"><ControlButton label="Click" onPress={() => undefined} /></Screen>);
    expect(view.getByRole('header')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Click' })).toBeTruthy();
  });
});
