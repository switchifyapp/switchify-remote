import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { ThemeProvider, useTheme } from './ThemeContext';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn() }));

const mockColorScheme = useColorScheme as jest.MockedFunction<typeof useColorScheme>;
const mockWindowDimensions = useWindowDimensions as jest.MockedFunction<typeof useWindowDimensions>;

function SchemeProbe() {
  return <Text>{useTheme().scheme}</Text>;
}

function TransparencyProbe() {
  return <Text>{useTheme().reducedTransparency ? 'opaque' : 'blurred'}</Text>;
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    mockWindowDimensions.mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  });

  afterEach(() => jest.restoreAllMocks());

  it('updates consumers when the device color scheme changes', async () => {
    mockColorScheme.mockReturnValue('light');
    const view = await render(<ThemeProvider><SchemeProbe /></ThemeProvider>);
    expect(view.getByText('light')).toBeTruthy();
    mockColorScheme.mockReturnValue('dark');
    await view.rerender(<ThemeProvider><SchemeProbe /></ThemeProvider>);
    expect(view.getByText('dark')).toBeTruthy();
  });

  it('tracks Reduce Transparency and removes its listener on unmount', async () => {
    let transparencyListener: ((enabled: boolean) => void) | undefined;
    const removeTransparencyListener = jest.fn();
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
    const addEventListener = jest.spyOn(AccessibilityInfo, 'addEventListener') as unknown as jest.Mock;
    addEventListener.mockImplementation((event: string, listener: (enabled: boolean) => void) => {
      if (event === 'reduceTransparencyChanged') {
        transparencyListener = listener;
        return { remove: removeTransparencyListener };
      }
      return { remove: jest.fn() };
    });

    const view = await render(<ThemeProvider><TransparencyProbe /></ThemeProvider>);
    expect(view.getByText('blurred')).toBeTruthy();
    await act(async () => transparencyListener?.(true));
    await view.findByText('opaque');
    await view.unmount();
    expect(removeTransparencyListener).toHaveBeenCalledTimes(1);
  });

  it('changes screen width for tablet layouts and omits a duplicate native-route heading', async () => {
    mockColorScheme.mockReturnValue('dark');
    const view = await render(<ThemeProvider><Screen title="Phone"><Text>Body</Text></Screen></ThemeProvider>);
    expect(view.getByTestId('screen-content').props.style.maxWidth).toBe(640);
    mockWindowDimensions.mockReturnValue({ width: 900, height: 1200, scale: 2, fontScale: 1 });
    await view.rerender(<ThemeProvider><Screen title="Tablet"><Text>Body</Text></Screen></ThemeProvider>);
    expect(view.getByTestId('screen-content').props.style.maxWidth).toBe(960);
    await view.rerender(<ThemeProvider><Screen nativeHeader title="Diagnostics"><Text>Body</Text></Screen></ThemeProvider>);
    expect(view.queryByRole('header')).toBeNull();
  });

  it('stacks compact headers and includes the bottom safe-area inset', async () => {
    mockColorScheme.mockReturnValue('dark');
    const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 34, left: 0 } };
    const view = await render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><Screen title="Remote" headerAccessory={<Text>Connected</Text>}><Text>Body</Text></Screen></ThemeProvider></SafeAreaProvider>);
    expect(StyleSheet.flatten(view.getByTestId('screen-header').props.style).flexDirection).toBe('column');
    expect(StyleSheet.flatten(view.getByTestId('screen-scroll').props.contentContainerStyle).paddingBottom).toBe(66);

    mockWindowDimensions.mockReturnValue({ width: 700, height: 900, scale: 2, fontScale: 1 });
    await view.rerender(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><Screen title="Remote" headerAccessory={<View><Text>Connected</Text></View>}><Text>Body</Text></Screen></ThemeProvider></SafeAreaProvider>);
    expect(StyleSheet.flatten(view.getByTestId('screen-header').props.style).flexDirection).toBe('row');
  });

  it('keeps a bottom accessory outside scrolling content at phone and tablet widths', async () => {
    mockColorScheme.mockReturnValue('dark');
    const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 34, left: 0 } };
    const view = await render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><Screen title="Remote" bottomAccessory={<Text>Choose PC</Text>}><Text>Controls</Text></Screen></ThemeProvider></SafeAreaProvider>);
    expect(StyleSheet.flatten(view.getByTestId('screen-scroll').props.contentContainerStyle).paddingBottom).toBe(20);
    expect(StyleSheet.flatten(view.getByTestId('screen-bottom-accessory-content').props.style).maxWidth).toBe(640);
    expect(view.getByTestId('screen-scroll').parent?.props.children[1].props.testID).toBe('screen-bottom-accessory');

    mockWindowDimensions.mockReturnValue({ width: 900, height: 1200, scale: 2, fontScale: 2 });
    await view.rerender(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><Screen title="Remote" bottomAccessory={<Text>Choose PC</Text>}><Text>Controls</Text></Screen></ThemeProvider></SafeAreaProvider>);
    expect(StyleSheet.flatten(view.getByTestId('screen-bottom-accessory-content').props.style).maxWidth).toBe(960);
  });
});
