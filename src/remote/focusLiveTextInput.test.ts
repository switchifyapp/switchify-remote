import type { TextInput } from 'react-native';
import { scheduleLiveTextInputFocus } from './focusLiveTextInput';

describe('scheduleLiveTextInputFocus', () => {
  let callbacks: Map<number, FrameRequestCallback>;
  let nextFrame: number;

  beforeEach(() => {
    callbacks = new Map();
    nextFrame = 1;
    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      const frame = nextFrame++;
      callbacks.set(frame, callback);
      return frame;
    });
    jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((frame: number | null | undefined) => { if (frame !== null && frame !== undefined) callbacks.delete(frame); });
  });

  afterEach(() => jest.restoreAllMocks());

  const runNextFrame = () => {
    const next = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
    if (!next) throw new Error('Expected a scheduled animation frame.');
    callbacks.delete(next[0]);
    next[1](0);
  };

  it('defers focus until the next frame when the input is not focused', () => {
    const input = { blur: jest.fn(), focus: jest.fn(), isFocused: jest.fn(() => false) } as unknown as TextInput;
    scheduleLiveTextInputFocus(() => input);
    expect(input.focus).not.toHaveBeenCalled();

    runNextFrame();
    expect(input.focus).toHaveBeenCalledTimes(1);
    expect(input.blur).not.toHaveBeenCalled();
    expect(callbacks.size).toBe(0);
  });

  it('clears stale focus before refocusing on the second frame', () => {
    const input = { blur: jest.fn(), focus: jest.fn(), isFocused: jest.fn(() => true) } as unknown as TextInput;
    scheduleLiveTextInputFocus(() => input);

    runNextFrame();
    expect(input.blur).toHaveBeenCalledTimes(1);
    expect(input.focus).not.toHaveBeenCalled();
    runNextFrame();
    expect(input.focus).toHaveBeenCalledTimes(1);
    expect(callbacks.size).toBe(0);
  });

  it.each([
    ['missing input', (): TextInput | null => null],
    ['throwing resolver', (): TextInput | null => { throw new Error('unmounted'); }],
  ] as const)('is safe for a %s', (_name, resolveInput) => {
    expect(() => {
      scheduleLiveTextInputFocus(resolveInput);
      runNextFrame();
    }).not.toThrow();
    expect(callbacks.size).toBe(0);
  });

  it('contains native focus-state, blur, and focus failures', () => {
    const stateFailure = { isFocused: jest.fn(() => { throw new Error('state'); }) } as unknown as TextInput;
    scheduleLiveTextInputFocus(() => stateFailure);
    expect(() => runNextFrame()).not.toThrow();

    const blurFailure = { blur: jest.fn(() => { throw new Error('blur'); }), isFocused: jest.fn(() => true) } as unknown as TextInput;
    scheduleLiveTextInputFocus(() => blurFailure);
    expect(() => runNextFrame()).not.toThrow();

    const focusFailure = { focus: jest.fn(() => { throw new Error('focus'); }), isFocused: jest.fn(() => false) } as unknown as TextInput;
    scheduleLiveTextInputFocus(() => focusFailure);
    expect(() => runNextFrame()).not.toThrow();
  });

  it('cancels either scheduled frame and remains safe when cancelled repeatedly', () => {
    const input = { blur: jest.fn(), focus: jest.fn(), isFocused: jest.fn(() => true) } as unknown as TextInput;
    const cancelFirst = scheduleLiveTextInputFocus(() => input);
    cancelFirst();
    cancelFirst();
    expect(callbacks.size).toBe(0);

    const cancelSecond = scheduleLiveTextInputFocus(() => input);
    runNextFrame();
    expect(input.blur).toHaveBeenCalledTimes(1);
    cancelSecond();
    expect(callbacks.size).toBe(0);
    expect(input.focus).not.toHaveBeenCalled();
  });
});
