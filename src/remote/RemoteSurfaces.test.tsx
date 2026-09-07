import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { RenderResult } from '@testing-library/react-native';
import * as Theme from '@/theme/ThemeContext';
import { Platform, StyleSheet } from 'react-native';
import type { ConnectionManager } from '@/connection/ConnectionManager';
import type { PointerProfile } from '@/domain/protocol/types';
import { MouseSurface } from './MouseSurface';
import { RemoteSession } from './RemoteSession';
import { TypingSurface } from './TypingSurface';
import { WindowSurface } from './WindowSurface';
import { scheduleLiveTextInputFocus } from './focusLiveTextInput';

jest.mock('./focusLiveTextInput', () => ({ scheduleLiveTextInputFocus: jest.fn(() => jest.fn()) }));

function profile(supportedCommands: string[]): PointerProfile {
  const repeat = supportedCommands.includes('mouse.repeat.start') && supportedCommands.includes('mouse.repeat.stop');
  return { displayId: 'display', scaleFactor: 1, bounds: { x: 0, y: 0, width: 100, height: 100 }, maxDelta: 128, recommendedDeltas: { small: 32, medium: 64, large: 128 }, capabilities: { noAckCommands: [], noAckMouseMove: false, supportedCommands, mouseRepeat: { supported: repeat, enabled: repeat, intervalMs: 250, minIntervalMs: 100, maxIntervalMs: 2000 }, keyRepeat: { supported: true, enabled: true, intervalMs: 250, initialDelayMs: 500, minIntervalMs: 100, maxIntervalMs: 1000, repeatableKeys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace', 'Delete', 'PageUp', 'PageDown'] }, pointerSpeed: { supported: true, setSupported: true, scalePercent: 100, minScalePercent: 5, maxScalePercent: 225, stepPercent: 5, baseMoveDelta: 64, effectiveMoveDelta: 64 }, displayNavigation: { supported: true, displayCount: 2 } } };
}

const manager = { send: jest.fn(async () => true) } as unknown as ConnectionManager;
const originalPlatform = Platform.OS;

describe('capability-driven remote surfaces', () => {
  beforeEach(() => {
    jest.mocked(scheduleLiveTextInputFocus).mockReset().mockImplementation(() => jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  it('disables unsupported mouse controls', async () => {
    const session = new RemoteSession(manager, profile(['mouse.click']));
    const view = await render(<MouseSurface session={session} state={session.snapshot()} />);
    expect(view.getByLabelText('Left click').props.accessibilityState.disabled).toBe(false);
    expect(view.getByLabelText('Double click').props.accessibilityState.disabled).toBe(true);
    expect(view.getByLabelText('Move up').props.accessibilityState.disabled).toBe(true);
    expect(view.getByLabelText('Faster').props.accessibilityState.disabled).toBe(true);
    expect(StyleSheet.flatten(view.getByTestId('mouse-secondary').props.style).width).toBe('100%');
  });

  it.each([
    [1143, 808, 1.5, undefined],
    [808, 1143, 1.5, undefined],
    [390, 844, 1, undefined],
    [1143, 808, 1, 400],
  ])('sizes Movement for %s × %s at text scale %s', async (width, height, fontScale, maxWidth) => {
    jest.spyOn(Theme, 'useLayout').mockReturnValue(Theme.classifyLayout(width, height, fontScale));
    const session = new RemoteSession(manager, profile(['mouse.click']));
    const view = await render(<MouseSurface session={session} state={session.snapshot()} />);
    const style = StyleSheet.flatten(view.getByTestId('mouse-movement').props.style);
    expect(style.width).toBe('100%');
    expect(style.maxWidth).toBe(maxWidth);
    expect(style.flex).toBe(maxWidth === undefined ? undefined : 1);
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

  it.each(['visible Enter control', 'software keyboard Return'] as const)('submits and clears live text from the %s', async (source) => {
    const focusTextInput = jest.mocked(scheduleLiveTextInputFocus);
    const send = jest.fn(async (_type: string, _payload?: unknown) => true);
    const session = new RemoteSession(
      { send } as unknown as ConnectionManager,
      profile(['keyboard.textStream.open', 'keyboard.textStream.chunk', 'keyboard.textStream.key', 'keyboard.textStream.close']),
    );
    const view = await render(<TypingSurface session={session} mode="live" draft="" />);
    const input = view.getByLabelText('Live text');

    await act(async () => { fireEvent.changeText(input, 'hello'); });
    await waitFor(() => expect(send.mock.calls.some(([type]) => type === 'keyboard.textStream.chunk')).toBe(true));
    if (source === 'visible Enter control') {
      await act(async () => { fireEvent.press(view.getByLabelText('Enter')); });
    } else {
      await act(async () => { fireEvent(input, 'submitEditing'); });
    }

    await waitFor(() => expect(view.getByLabelText('Live text').props.value).toBe(''));
    await waitFor(() => expect(focusTextInput).toHaveBeenCalledTimes(1));
    expect(send.mock.calls.filter(([type]) => type === 'keyboard.textStream.key')).toHaveLength(1);
    expect(send.mock.calls.find(([type]) => type === 'keyboard.textStream.key')?.[1]).toMatchObject({ key: 'Enter' });

    await act(async () => { fireEvent.changeText(view.getByLabelText('Live text'), 'next'); });
    await waitFor(() => expect(send.mock.calls.filter(([type]) => type === 'keyboard.textStream.chunk')).toHaveLength(2));
    expect(send.mock.calls.filter(([type, payload]) => type === 'keyboard.textStream.key' && (payload as { key?: string }).key === 'Backspace')).toHaveLength(0);
  });

  it('retains live text after a failed Enter and offers a specific retry', async () => {
    const focusTextInput = jest.mocked(scheduleLiveTextInputFocus);
    let enterAttempt = 0;
    const send = jest.fn(async (type: string) => {
      if (type !== 'keyboard.textStream.key') return true;
      enterAttempt += 1;
      return enterAttempt > 1;
    });
    const session = new RemoteSession(
      { send } as unknown as ConnectionManager,
      profile(['keyboard.textStream.open', 'keyboard.textStream.chunk', 'keyboard.textStream.key', 'keyboard.textStream.close']),
    );
    const view = await render(<TypingSurface session={session} mode="live" draft="" />);

    await act(async () => { fireEvent.changeText(view.getByLabelText('Live text'), 'keep me'); });
    await waitFor(() => expect(send.mock.calls.some(([type]) => type === 'keyboard.textStream.chunk')).toBe(true));
    await act(async () => { fireEvent.press(view.getByLabelText('Enter')); });

    await waitFor(() => expect(view.getByLabelText('Retry Enter')).toBeTruthy());
    expect(view.getByLabelText('Live text').props.value).toBe('keep me');
    await waitFor(() => expect(focusTextInput).toHaveBeenCalledTimes(1));
    await act(async () => { fireEvent.press(view.getByLabelText('Retry Enter')); });
    await waitFor(() => expect(view.getByLabelText('Live text').props.value).toBe(''));
    await waitFor(() => expect(focusTextInput).toHaveBeenCalledTimes(2));
    expect(send.mock.calls.filter(([type]) => type === 'keyboard.textStream.chunk')).toHaveLength(1);
    expect(send.mock.calls.filter(([type]) => type === 'keyboard.textStream.key')).toHaveLength(2);
  });

  it.each(['mode change', 'session replacement', 'unmount'] as const)('cancels scheduled live focus on %s', async (transition) => {
    const cancelFocus = jest.fn();
    jest.mocked(scheduleLiveTextInputFocus).mockReturnValue(cancelFocus);
    const send = jest.fn(async (_type: string) => true);
    const supported = profile(['keyboard.textStream.open', 'keyboard.textStream.chunk', 'keyboard.textStream.key', 'keyboard.textStream.close']);
    const session = new RemoteSession({ send } as unknown as ConnectionManager, supported);
    const view = await render(<TypingSurface session={session} mode="live" draft="" />);

    await act(async () => { fireEvent.changeText(view.getByLabelText('Live text'), 'done'); });
    await waitFor(() => expect(send.mock.calls.some(([type]) => type === 'keyboard.textStream.chunk')).toBe(true));
    await act(async () => { fireEvent.press(view.getByLabelText('Enter')); });
    await waitFor(() => expect(scheduleLiveTextInputFocus).toHaveBeenCalledTimes(1));

    if (transition === 'mode change') await view.rerender(<TypingSurface session={session} mode="draft" draft="" />);
    else if (transition === 'session replacement') {
      const replacement = new RemoteSession({ send: jest.fn(async () => true) } as unknown as ConnectionManager, supported);
      await view.rerender(<TypingSurface session={replacement} mode="live" draft="" />);
    } else await view.unmount();

    expect(cancelFocus).toHaveBeenCalledTimes(1);
    expect(scheduleLiveTextInputFocus).toHaveBeenCalledTimes(1);
  });

  it('cancels the previous focus restoration when another Enter submission starts', async () => {
    const cancelFirstFocus = jest.fn();
    jest.mocked(scheduleLiveTextInputFocus).mockReturnValueOnce(cancelFirstFocus).mockReturnValue(jest.fn());
    const send = jest.fn(async () => true);
    const session = new RemoteSession(
      { send } as unknown as ConnectionManager,
      profile(['keyboard.textStream.open', 'keyboard.textStream.chunk', 'keyboard.textStream.key', 'keyboard.textStream.close']),
    );
    const view = await render(<TypingSurface session={session} mode="live" draft="" />);

    await act(async () => { fireEvent.changeText(view.getByLabelText('Live text'), 'first'); });
    await act(async () => { fireEvent.press(view.getByLabelText('Enter')); });
    await waitFor(() => expect(scheduleLiveTextInputFocus).toHaveBeenCalledTimes(1));
    await act(async () => { fireEvent.changeText(view.getByLabelText('Live text'), 'second'); });
    await act(async () => { fireEvent.press(view.getByLabelText('Enter')); });

    expect(cancelFirstFocus).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(scheduleLiveTextInputFocus).toHaveBeenCalledTimes(2));
  });

  it('blocks duplicate live submissions and further input until Enter completes', async () => {
    let releaseEnter!: (value: boolean) => void;
    const pendingEnter = new Promise<boolean>((resolve) => { releaseEnter = resolve; });
    const send = jest.fn(async (type: string) => type === 'keyboard.textStream.key' ? pendingEnter : true);
    const session = new RemoteSession(
      { send } as unknown as ConnectionManager,
      profile(['keyboard.textStream.open', 'keyboard.textStream.chunk', 'keyboard.textStream.key', 'keyboard.textStream.close']),
    );
    const view = await render(<TypingSurface session={session} mode="live" draft="" />);
    const input = view.getByLabelText('Live text');
    await act(async () => { fireEvent.changeText(input, 'pending'); });
    await waitFor(() => expect(send.mock.calls.some(([type]) => type === 'keyboard.textStream.chunk')).toBe(true));

    await act(async () => {
      fireEvent.press(view.getByLabelText('Enter'));
      fireEvent(input, 'submitEditing');
      fireEvent.changeText(input, 'must not replace pending');
      await Promise.resolve();
    });
    await waitFor(() => expect(view.getByLabelText('Live text').props.editable).toBe(false));
    expect(view.getByLabelText('Enter').props.accessibilityState.disabled).toBe(true);
    expect(view.getByLabelText('Escape').props.accessibilityState.disabled).toBe(false);
    expect(send.mock.calls.filter(([type]) => type === 'keyboard.textStream.key')).toHaveLength(1);
    expect(view.getByLabelText('Live text').props.value).toBe('pending');

    await act(async () => {
      releaseEnter(true);
      await pendingEnter;
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(view.getByLabelText('Live text').props.value).toBe(''));
    expect(view.getByLabelText('Live text').props.editable).toBe(true);
    expect(send.mock.calls.filter(([type]) => type === 'keyboard.textStream.key')).toHaveLength(1);
  });

  it('keeps draft Return multiline without submitting or clearing', async () => {
    const send = jest.fn(async () => true);
    const session = new RemoteSession(
      { send } as unknown as ConnectionManager,
      profile(['keyboard.typeText', 'keyboard.key']),
    );
    const view = await render(<TypingSurface session={session} mode="draft" draft={'first\nsecond'} />);
    const input = view.getByLabelText('Draft text');

    expect(input.props.submitBehavior).toBe('newline');
    await act(async () => { fireEvent(input, 'submitEditing'); });
    expect(input.props.value).toBe('first\nsecond');
    expect(send).not.toHaveBeenCalled();
  });

  it('gates modifiers, shortcuts, and window commands independently', async () => {
    const session = new RemoteSession(manager, profile(['keyboard.modifierDown']));
    const view = await render(<WindowSurface session={session} state={session.snapshot()} platform="windows" />);
    expect(view.getByLabelText('Ctrl').props.accessibilityState.disabled).toBe(false);
    expect(view.getByLabelText('Next app').props.accessibilityState.disabled).toBe(true);
    expect(view.getByLabelText('A').props.accessibilityState.disabled).toBe(true);
    expect(view.getByLabelText('Move pointer to monitor left').props.accessibilityState.disabled).toBe(true);
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
    for (const label of ['Ctrl', 'Alt', 'Shift', 'Start', 'Next app', 'Previous app', 'Task view', 'Show desktop', 'Minimize', 'Maximize', 'Close', 'A', 'C', 'V', 'X', 'Move pointer to monitor left', 'Move pointer to monitor up', 'Move pointer to monitor down', 'Move pointer to monitor right']) {
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
      ['mouse.repeat.stop', {}, 'ack'],
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
      ['mouse.repeat.stop', {}, 'ack'],
    ]);
  });

  it.each([
    ['android', true],
    ['ios', false],
  ] as const)('shows Android-only physical-switch guidance on %s while preserving Stop movement', async (platform, showsGuidance) => {
    jest.restoreAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
    const session = new RemoteSession(
      { send: jest.fn(async () => true) } as unknown as ConnectionManager,
      profile(['mouse.move', 'mouse.repeat.start', 'mouse.repeat.stop']),
    );
    const mouse = await render(<MouseSurface session={session} state={session.snapshot()} physicalSwitchStopAvailable={false} />);

    expect(Boolean(mouse.queryByText('Switchify is unavailable. Use a Remote control to stop a repeat.'))).toBe(showsGuidance);
    await act(async () => { fireEvent.press(mouse.getByLabelText('Move up')); await Promise.resolve(); });
    await act(async () => { mouse.rerender(<MouseSurface session={session} state={session.snapshot()} physicalSwitchStopAvailable={false} />); });

    expect(mouse.getByRole('button', { name: 'Stop movement' })).toBeTruthy();
    expect(Boolean(mouse.queryByText('Switchify is unavailable. Use a Remote control to stop a repeat.'))).toBe(showsGuidance);
  });

  it('announces a repeating key with key wording rather than pointer wording', async () => {
    jest.restoreAllMocks();
    const session = new RemoteSession(
      { send: jest.fn(async () => true) } as unknown as ConnectionManager,
      profile(['keyboard.key', 'mouse.repeat.start', 'mouse.repeat.stop']),
    );
    await act(async () => { await session.key('ArrowDown'); });
    const view = await render(<MouseSurface session={session} state={session.snapshot()} />);
    expect(view.getByRole('button', { name: 'Stop repeating' })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Stop movement' })).toBeNull();
    expect(view.getByText(/A key is repeating/)).toBeTruthy();
  });

  it('routes every displayed remote action through the capability-approved session', async () => {
    const send = jest.fn(async (_type: string, _payload?: unknown, _mode?: unknown) => true);
    const actionManager = { send } as unknown as ConnectionManager;
    const commands = ['mouse.move', 'mouse.click', 'mouse.doubleClick', 'mouse.rightClick', 'mouse.dragStart', 'mouse.dragEnd', 'mouse.scroll', 'mouse.repeat.start', 'mouse.repeat.stop', 'pointer.speed.set', 'pointer.display.move', 'keyboard.typeText', 'keyboard.key', 'keyboard.textStream.open', 'keyboard.textStream.chunk', 'keyboard.textStream.key', 'keyboard.textStream.close', 'keyboard.modifierDown', 'keyboard.modifierUp', 'keyboard.shortcut', 'window.control'];
    const session = new RemoteSession(actionManager, profile(commands));
    const press = async (control: RenderResult, label: string) => { await act(async () => { fireEvent.press(control.getByLabelText(label)); await Promise.resolve(); }); };
    const mouse = await render(<MouseSurface session={session} state={session.snapshot()} />);
    for (const label of ['Move up and left', 'Move up', 'Move up and right', 'Move left', 'Left click', 'Move right', 'Move down and left', 'Move down', 'Move down and right', 'Double click', 'Right click', 'Start drag', 'Scroll up', 'Scroll down', 'Slower', 'Faster', 'Move pointer to monitor left', 'Move pointer to monitor up', 'Move pointer to monitor down', 'Move pointer to monitor right']) await press(mouse, label);
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
    for (const label of ['Ctrl', 'Alt', 'Shift', 'Start', 'Next app', 'Previous app', 'Task view', 'Show desktop', 'Minimize', 'Maximize', 'Close', 'Ctrl+Alt+Shift+Start+A', 'C', 'V', 'X', 'Move pointer to monitor left', 'Move pointer to monitor up', 'Move pointer to monitor down', 'Move pointer to monitor right']) await press(window, label);
    await waitFor(() => expect(new Set(send.mock.calls.map(([type]) => type))).toEqual(new Set(commands)));
  });
});
