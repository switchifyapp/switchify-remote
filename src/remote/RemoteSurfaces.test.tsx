import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { RenderResult } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { ConnectionManager } from '@/connection/ConnectionManager';
import type { PointerProfile } from '@/domain/protocol/types';
import { MouseSurface } from './MouseSurface';
import { RemoteSession } from './RemoteSession';
import { TypingSurface } from './TypingSurface';
import { WindowSurface } from './WindowSurface';

function profile(supportedCommands: string[]): PointerProfile {
  const repeat = supportedCommands.includes('mouse.repeat.start') && supportedCommands.includes('mouse.repeat.stop');
  return { displayId: 'display', scaleFactor: 1, bounds: { x: 0, y: 0, width: 100, height: 100 }, maxDelta: 128, recommendedDeltas: { small: 32, medium: 64, large: 128 }, capabilities: { noAckCommands: [], noAckMouseMove: false, supportedCommands, mouseRepeat: { supported: repeat, enabled: repeat, intervalMs: 250, minIntervalMs: 100, maxIntervalMs: 2000 }, pointerSpeed: { supported: true, setSupported: true, scalePercent: 100, minScalePercent: 5, maxScalePercent: 225, stepPercent: 5, baseMoveDelta: 64, effectiveMoveDelta: 64 }, displayNavigation: { supported: true, displayCount: 2 } } };
}

const manager = { send: jest.fn(async () => true) } as unknown as ConnectionManager;

describe('capability-driven remote surfaces', () => {
  it('disables unsupported mouse controls', async () => {
    const session = new RemoteSession(manager, profile(['mouse.click']));
    const view = await render(<MouseSurface session={session} state={session.snapshot()} />);
    expect(view.getByLabelText('Left click').props.accessibilityState.disabled).toBe(false);
    expect(view.getByLabelText('Double click').props.accessibilityState.disabled).toBe(true);
    expect(view.getByLabelText('Move up').props.accessibilityState.disabled).toBe(true);
    expect(view.getByLabelText('Faster').props.accessibilityState.disabled).toBe(true);
    expect(StyleSheet.flatten(view.getByTestId('mouse-secondary').props.style).width).toBe('100%');
  });

  it('falls back to draft typing when streams are unsupported', async () => {
    const session = new RemoteSession(manager, profile(['keyboard.typeText', 'keyboard.key']));
    const view = await render(<TypingSurface session={session} mode="draft" draft="protected draft" />);
    expect(view.getByLabelText('Type live').props.accessibilityState.disabled).toBe(true);
    expect(view.getByLabelText('Write a draft').props.accessibilityState.disabled).toBe(false);
    expect(view.getByLabelText('Send to PC').props.accessibilityState.disabled).toBe(false);
  });

  it('keeps failed live text visible and offers an explicit retry', async () => {
    const failingManager = { send: jest.fn(async () => false) } as unknown as ConnectionManager;
    const session = new RemoteSession(failingManager, profile(['keyboard.textStream.open', 'keyboard.textStream.chunk', 'keyboard.textStream.key', 'keyboard.textStream.close']));
    const view = await render(<TypingSurface session={session} mode="live" draft="" />);
    await act(async () => { fireEvent.changeText(view.getByLabelText('Live text'), 'unsent'); });
    await waitFor(() => expect(view.getByLabelText('Retry unsent text')).toBeTruthy());
    expect(view.getByLabelText('Live text').props.value).toBe('unsent');
  });

  it('gates modifiers, shortcuts, and window commands independently', async () => {
    const session = new RemoteSession(manager, profile(['keyboard.modifierDown']));
    const view = await render(<WindowSurface session={session} state={session.snapshot()} platform="windows" />);
    expect(view.getByLabelText('Ctrl').props.accessibilityState.disabled).toBe(false);
    expect(view.getByLabelText('Next app').props.accessibilityState.disabled).toBe(true);
    expect(view.getByLabelText('A').props.accessibilityState.disabled).toBe(true);
    expect(view.getByLabelText('Left').props.accessibilityState.disabled).toBe(true);
  });

  it('disables every action category when no commands are advertised', async () => {
    const session = new RemoteSession(manager, profile([]));
    const mouse = await render(<MouseSurface session={session} state={session.snapshot()} />);
    for (const label of ['Move up and left', 'Move up', 'Move up and right', 'Move left', 'Left click', 'Move right', 'Move down and left', 'Move down', 'Move down and right', 'Double click', 'Right click', 'Start drag', 'Scroll up', 'Scroll down', 'Slower', 'Faster']) {
      expect(mouse.getByLabelText(label).props.accessibilityState.disabled).toBe(true);
    }
    const typing = await render(<TypingSurface session={session} mode="draft" draft="protected" />);
    for (const label of ['Type live', 'Write a draft', 'Send to PC', 'Backspace', 'Enter', 'Escape', 'Tab', 'Left', 'Up', 'Down', 'Right']) {
      expect(typing.getByLabelText(label).props.accessibilityState.disabled).toBe(true);
    }
    const window = await render(<WindowSurface session={session} state={session.snapshot()} platform="windows" />);
    for (const label of ['Ctrl', 'Alt', 'Shift', 'Start', 'Next app', 'Previous app', 'Task view', 'Show desktop', 'Minimize', 'Maximize', 'Close', 'A', 'C', 'V', 'X', 'Left', 'Up', 'Down', 'Right']) {
      expect(window.getByLabelText(label).props.accessibilityState.disabled).toBe(true);
    }
  });

  it('uses the desktop-compatible scroll step for direct and repeated scrolling', async () => {
    const directSend = jest.fn(async () => true);
    const directSession = new RemoteSession(
      { send: directSend } as unknown as ConnectionManager,
      profile(['mouse.scroll']),
    );
    const directMouse = await render(<MouseSurface session={directSession} state={directSession.snapshot()} />);

    await act(async () => { fireEvent.press(directMouse.getByLabelText('Scroll up')); await Promise.resolve(); });
    await act(async () => { fireEvent.press(directMouse.getByLabelText('Scroll down')); await Promise.resolve(); });

    expect(directSend.mock.calls).toEqual([
      ['mouse.scroll', { dx: 0, dy: 5 }, 'ack'],
      ['mouse.scroll', { dx: 0, dy: -5 }, 'ack'],
    ]);

    const repeatSend = jest.fn(async () => true);
    const repeatSession = new RemoteSession(
      { send: repeatSend } as unknown as ConnectionManager,
      profile(['mouse.scroll', 'mouse.repeat.start', 'mouse.repeat.stop']),
    );
    const repeatMouse = await render(<MouseSurface session={repeatSession} state={repeatSession.snapshot()} />);

    await act(async () => { fireEvent.press(repeatMouse.getByLabelText('Scroll up')); await Promise.resolve(); });
    await repeatSession.stopRepeat();
    await act(async () => { fireEvent.press(repeatMouse.getByLabelText('Scroll down')); await Promise.resolve(); });

    expect(repeatSend.mock.calls).toEqual([
      ['mouse.repeat.start', { command: { type: 'mouse.scroll', payload: { dx: 0, dy: 5 } } }],
      ['mouse.repeat.stop', {}, 'none'],
      ['mouse.repeat.start', { command: { type: 'mouse.scroll', payload: { dx: 0, dy: -5 } } }],
    ]);
  });

  it('offers a dedicated stop action while pointer movement repeats', async () => {
    const send = jest.fn(async () => true);
    const session = new RemoteSession(
      { send } as unknown as ConnectionManager,
      profile(['mouse.move', 'mouse.repeat.start', 'mouse.repeat.stop']),
    );
    const mouse = await render(<MouseSurface session={session} state={session.snapshot()} />);
    await act(async () => { fireEvent.press(mouse.getByLabelText('Move up')); await Promise.resolve(); });
    await act(async () => { mouse.rerender(<MouseSurface session={session} state={session.snapshot()} />); });
    await act(async () => { fireEvent.press(mouse.getByRole('button', { name: 'Stop movement' })); await Promise.resolve(); });
    expect(send.mock.calls).toEqual([
      ['mouse.repeat.start', { command: { type: 'mouse.move', payload: { dx: 0, dy: -64 } } }],
      ['mouse.repeat.stop', {}, 'none'],
    ]);
  });

  it('routes every displayed remote action through the capability-approved session', async () => {
    const send = jest.fn(async (_type: string, _payload?: unknown, _mode?: unknown) => true);
    const actionManager = { send } as unknown as ConnectionManager;
    const commands = ['mouse.move', 'mouse.click', 'mouse.doubleClick', 'mouse.rightClick', 'mouse.dragStart', 'mouse.dragEnd', 'mouse.scroll', 'mouse.repeat.start', 'mouse.repeat.stop', 'pointer.speed.set', 'pointer.display.move', 'keyboard.typeText', 'keyboard.key', 'keyboard.textStream.open', 'keyboard.textStream.chunk', 'keyboard.textStream.key', 'keyboard.textStream.close', 'keyboard.modifierDown', 'keyboard.modifierUp', 'keyboard.shortcut', 'window.control'];
    const session = new RemoteSession(actionManager, profile(commands));
    const press = async (control: RenderResult, label: string) => { await act(async () => { fireEvent.press(control.getByLabelText(label)); await Promise.resolve(); }); };
    const mouse = await render(<MouseSurface session={session} state={session.snapshot()} />);
    for (const label of ['Move up and left', 'Move up', 'Move up and right', 'Move left', 'Left click', 'Move right', 'Move down and left', 'Move down', 'Move down and right', 'Double click', 'Right click', 'Start drag', 'Scroll up', 'Scroll down', 'Slower', 'Faster', 'Left', 'Up', 'Down', 'Right']) await press(mouse, label);
    await act(async () => { mouse.rerender(<MouseSurface session={session} state={session.snapshot()} />); });
    await press(mouse, 'End drag');
    const directSession = new RemoteSession(actionManager, profile(commands.filter((type) => !type.startsWith('mouse.repeat.'))));
    const directMouse = await render(<MouseSurface session={directSession} state={directSession.snapshot()} />);
    await press(directMouse, 'Move up');
    await press(directMouse, 'Scroll up');

    const typing = await render(<TypingSurface session={session} mode="draft" draft="hello" />);
    await press(typing, 'Send to PC');
    for (const label of ['Backspace', 'Enter', 'Escape', 'Tab', 'Left', 'Up', 'Down', 'Right']) await press(typing, label);
    const liveTyping = await render(<TypingSurface session={session} mode="live" draft="" />);
    await act(async () => { fireEvent.changeText(liveTyping.getByLabelText('Live text'), 'live'); });
    await waitFor(() => expect(send.mock.calls.some(([type]) => type === 'keyboard.textStream.chunk')).toBe(true));
    await press(liveTyping, 'Enter');
    await press(liveTyping, 'Write a draft');

    const window = await render(<WindowSurface session={session} state={session.snapshot()} platform="windows" />);
    for (const label of ['Ctrl', 'Alt', 'Shift', 'Start', 'Next app', 'Previous app', 'Task view', 'Show desktop', 'Minimize', 'Maximize', 'Close', 'A', 'C', 'V', 'X', 'Left', 'Up', 'Down', 'Right']) await press(window, label);
    await waitFor(() => expect(new Set(send.mock.calls.map(([type]) => type))).toEqual(new Set(commands)));
  });
});
