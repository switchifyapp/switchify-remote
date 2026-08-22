import { fireEvent, render } from '@testing-library/react-native';
import type { ForwardingState } from './ForwardingController';
import { ForwardingBody } from './ForwardingSurface';

jest.mock('@expo/vector-icons/MaterialIcons', () => () => null);

const profile = { id: 'keyboard', version: 2, name: 'Keyboard profile', kind: 'mapped' as const, bindings: [{ switchId: 1, label: 'Space', behavior: 'stateful' as const }] };
const mapping = { keyCode: 20, name: 'External switch 1', switchId: 1, outputLabel: 'Space', pressed: false, downTimeMs: null };

function state(phase: ForwardingState['phase']): ForwardingState {
  return {
    phase,
    profiles: [profile],
    selectedProfileId: profile.id,
    mappings: [mapping],
    overflow: ['External switch 9', 'External switch 10'],
    message: phase === 'failed' ? 'Could not start Switch Forwarding.' : null,
  };
}

describe('ForwardingBody switch mappings', () => {
  it.each(['idle', 'starting', 'failed'] as const)('keeps profiles but hides stale mappings while %s', async (phase) => {
    const screen = await render(<ForwardingBody state={state(phase)} onSelect={() => undefined} onToggle={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Keyboard profile' })).toBeTruthy();
    expect(screen.queryByText('External switch 1')).toBeNull();
    expect(screen.queryByText(/additional switches/i)).toBeNull();
  });

  it('shows mapped switches and overflow only while forwarding is active', async () => {
    const screen = await render(<ForwardingBody state={state('active')} onSelect={() => undefined} onToggle={() => undefined} />);

    expect(screen.getByText('External switch 1')).toBeTruthy();
    expect(screen.getByLabelText('External switch 1, Space, released')).toBeTruthy();
    expect(screen.getByText('2 additional switches are not forwarded. Only the first eight are supported.')).toBeTruthy();
  });

  it('removes mappings after manual or safety stops', async () => {
    const screen = await render(<ForwardingBody state={state('active')} onSelect={() => undefined} onToggle={() => undefined} />);
    expect(screen.getByText('External switch 1')).toBeTruthy();

    await screen.rerender(<ForwardingBody state={state('idle')} onSelect={() => undefined} onToggle={() => undefined} />);
    expect(screen.queryByText('External switch 1')).toBeNull();
    expect(screen.getByRole('button', { name: 'Start forwarding' })).toBeTruthy();
  });

  it('does not reveal restored mappings until the session becomes active', async () => {
    const screen = await render(<ForwardingBody state={state('starting')} onSelect={() => undefined} onToggle={() => undefined} />);
    expect(screen.queryByText('External switch 1')).toBeNull();

    await screen.rerender(<ForwardingBody state={state('active')} onSelect={() => undefined} onToggle={() => undefined} />);
    expect(screen.getByText('External switch 1')).toBeTruthy();
  });

  it('preserves profile and forwarding actions', async () => {
    const onSelect = jest.fn();
    const onToggle = jest.fn();
    const screen = await render(<ForwardingBody state={state('idle')} onSelect={onSelect} onToggle={onToggle} />);

    fireEvent.press(screen.getByRole('button', { name: 'Keyboard profile' }));
    fireEvent.press(screen.getByRole('button', { name: 'Start forwarding' }));
    expect(onSelect).toHaveBeenCalledWith('keyboard');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
