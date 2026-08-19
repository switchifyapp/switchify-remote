import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, StyleSheet, useWindowDimensions } from 'react-native';

import { SelectorField } from './SelectorField';
import { focusAccessibilityTarget } from './accessibilityFocus';
import { ThemeProvider } from '@/theme/ThemeContext';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('./accessibilityFocus', () => ({ focusAccessibilityTarget: jest.fn() }));

const mockFocusAccessibilityTarget = focusAccessibilityTarget as jest.MockedFunction<typeof focusAccessibilityTarget>;
const mockWindowDimensions = useWindowDimensions as jest.MockedFunction<typeof useWindowDimensions>;
const options = [{ key: 'mouse', label: 'Mouse' }, { key: 'typing', label: 'Typing' }, { key: 'window', label: 'Window' }] as const;
const originalPlatform = Platform.OS;

describe('SelectorField', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    jest.mocked(AccessibilityInfo.announceForAccessibilityWithOptions).mockClear();
    jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    mockFocusAccessibilityTarget.mockClear();
    mockFocusAccessibilityTarget.mockImplementation(() => undefined);
    mockWindowDimensions.mockReturnValue({ width: 360, height: 800, scale: 3, fontScale: 1 });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('exposes one minimum-size button with its current value', async () => {
    const view = await render(<SelectorField label="Surface" options={options} selectedKey="mouse" onSelect={() => undefined} />);
    const field = view.getByRole('button', { name: 'Surface' });
    expect(field.props.accessibilityValue).toEqual({ text: 'Mouse' });
    expect(StyleSheet.flatten(field.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(view.getByText('Surface: Mouse')).toBeTruthy();
    expect(view.getAllByRole('button')).toHaveLength(1);
  });

  it('opens a selected option list, selects once, announces, and restores focus', async () => {
    const onSelect = jest.fn();
    const view = await render(<SelectorField label="Surface" options={options} selectedKey="mouse" onSelect={onSelect} />);
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Surface' })));
    expect(await view.findByRole('button', { name: 'Mouse', selected: true })).toBeTruthy();
    expect(view.getByTestId('selector-dialog').props.accessibilityViewIsModal).toBe(true);
    expect(view.getAllByRole('button').map((button) => button.props.accessibilityLabel).slice(-4)).toEqual(['Mouse', 'Typing', 'Window', 'Close']);
    const modal = view.getByTestId('selector-modal');
    await act(async () => modal.props.onShow());
    await act(async () => jest.runOnlyPendingTimers());
    expect(mockFocusAccessibilityTarget).toHaveBeenCalledTimes(1);
    expect(mockFocusAccessibilityTarget.mock.calls[0]![0]).not.toBeNull();

    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Typing' })));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('typing');
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenCalledWith('Surface: Typing', { queue: true });
    await act(async () => jest.runOnlyPendingTimers());
    await waitFor(() => expect(view.queryByTestId('selector-modal')).toBeNull());
    await act(async () => modal.props.onDismiss());
    await act(async () => jest.runOnlyPendingTimers());
    expect(mockFocusAccessibilityTarget).toHaveBeenCalledTimes(2);
    expect(mockFocusAccessibilityTarget.mock.calls[1]![0]).not.toBeNull();
  });

  it('dismisses through Close without selecting', async () => {
    const onSelect = jest.fn();
    const view = await render(<SelectorField label="Surface" options={options} selectedKey="mouse" onSelect={onSelect} />);
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Surface' })));
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Close' })));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('dismisses through the scrim without selecting', async () => {
    const onSelect = jest.fn();
    const view = await render(<SelectorField label="Surface" options={options} selectedKey="mouse" onSelect={onSelect} />);
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Surface' })));
    const scrim = view.getByTestId('selector-scrim', { includeHiddenElements: true });
    await act(async () => fireEvent.press(scrim));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('dismisses through Android back without selecting', async () => {
    const onSelect = jest.fn();
    const view = await render(<SelectorField label="Surface" options={options} selectedKey="mouse" onSelect={onSelect} />);
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Surface' })));
    await act(async () => view.getByTestId('selector-modal').props.onRequestClose());
    await waitFor(() => expect(view.queryByTestId('selector-modal')).toBeNull());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('dismisses through accessibility escape without selecting', async () => {
    const onSelect = jest.fn();
    const view = await render(<SelectorField label="Surface" options={options} selectedKey="mouse" onSelect={onSelect} />);
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Surface' })));
    await act(async () => view.getByTestId('selector-dialog').props.onAccessibilityEscape());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not crash when focus lookup fails or a scheduled focus outlives the component', async () => {
    mockFocusAccessibilityTarget.mockImplementation(() => { throw new Error('unavailable'); });
    const view = await render(<SelectorField label="Surface" options={options} selectedKey="mouse" onSelect={() => undefined} />);
    await act(async () => fireEvent.press(await view.findByRole('button', { name: 'Surface' })));
    await act(async () => view.getByTestId('selector-modal').props.onShow());
    await act(async () => view.unmount());
    await expect(act(async () => jest.runOnlyPendingTimers())).resolves.toBeUndefined();
  });

  it('disables modal animation when reduced motion is enabled', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const view = await render(<ThemeProvider><SelectorField label="Surface" options={options} selectedKey="mouse" onSelect={() => undefined} /></ThemeProvider>);
    const field = await view.findByRole('button', { name: 'Surface' });
    await act(async () => fireEvent.press(field));
    await waitFor(() => expect(view.getByTestId('selector-modal').props.animationType).toBe('none'));
  });

  it('tears down the Android modal without animation before restoring focus', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const view = await render(<SelectorField label="Surface" options={options} selectedKey="mouse" onSelect={() => undefined} />);
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Surface' })));
    expect(view.getByTestId('selector-modal').props.animationType).toBe('none');

    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Close' })));
    expect(mockFocusAccessibilityTarget).not.toHaveBeenCalled();
    await act(async () => jest.runOnlyPendingTimers());
    expect(mockFocusAccessibilityTarget).toHaveBeenCalledTimes(1);
    expect(mockFocusAccessibilityTarget.mock.calls[0]![0]).not.toBeNull();
  });

  it('waits for asynchronous persistence before exposing, announcing, and focusing the new value', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    let resolveSelection: (() => void) | undefined;
    const onSelect = jest.fn(() => new Promise<void>((resolve) => { resolveSelection = resolve; }));
    const view = await render(<SelectorField label="Surface" options={options} selectedKey="mouse" onSelect={onSelect} />);
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Surface' })));
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Typing' })));

    expect(view.getByTestId('selector-modal')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Surface', hidden: true }).props.accessibilityValue).toEqual({ text: 'Mouse' });
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).not.toHaveBeenCalled();
    expect(mockFocusAccessibilityTarget).not.toHaveBeenCalled();

    await act(async () => resolveSelection?.());
    expect(view.getByRole('button', { name: 'Surface' }).props.accessibilityValue).toEqual({ text: 'Typing' });
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenCalledWith('Surface: Typing', { queue: true });
    expect(mockFocusAccessibilityTarget).not.toHaveBeenCalled();
    await act(async () => jest.runOnlyPendingTimers());
    expect(mockFocusAccessibilityTarget).toHaveBeenCalledTimes(1);
  });

  it('keeps the modal open and gives sanitized failure feedback when persistence fails', async () => {
    const view = await render(<SelectorField label="Surface" options={options} selectedKey="mouse" onSelect={() => Promise.reject(new Error('write failed'))} />);
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Surface' })));
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Typing' })));

    expect(view.getByTestId('selector-modal')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Surface', hidden: true }).props.accessibilityValue).toEqual({ text: 'Mouse' });
    expect(view.getByText('Surface could not be saved. Try again.')).toBeTruthy();
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenCalledWith('Surface could not be saved. Try again.', { queue: true });
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).not.toHaveBeenCalledWith(expect.stringContaining('write failed'), expect.anything());
  });

  it('suppresses stale completion after dismissal during persistence', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    let resolveSelection: (() => void) | undefined;
    const onSelect = jest.fn(() => new Promise<void>((resolve) => { resolveSelection = resolve; }));
    const view = await render(<SelectorField label="Surface" options={options} selectedKey="mouse" onSelect={onSelect} />);
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Surface' })));
    await act(async () => fireEvent.press(view.getByRole('button', { name: 'Typing' })));
    await act(async () => fireEvent.press(view.getByTestId('selector-scrim', { includeHiddenElements: true })));
    await act(async () => jest.runOnlyPendingTimers());
    expect(mockFocusAccessibilityTarget).toHaveBeenCalledTimes(1);

    await act(async () => resolveSelection?.());
    await act(async () => jest.runOnlyPendingTimers());
    expect(view.queryByTestId('selector-modal')).toBeNull();
    expect(AccessibilityInfo.announceForAccessibilityWithOptions).not.toHaveBeenCalled();
    expect(mockFocusAccessibilityTarget).toHaveBeenCalledTimes(1);
  });
});
