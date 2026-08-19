import { render } from '@testing-library/react-native';
import { StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
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

describe('ThemeProvider', () => {
  beforeEach(() => {
    mockWindowDimensions.mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  });

  it('updates consumers when the device color scheme changes', async () => {
    mockColorScheme.mockReturnValue('light');
    const view = await render(<ThemeProvider><SchemeProbe /></ThemeProvider>);
    expect(view.getByText('light')).toBeTruthy();
    mockColorScheme.mockReturnValue('dark');
    await view.rerender(<ThemeProvider><SchemeProbe /></ThemeProvider>);
    expect(view.getByText('dark')).toBeTruthy();
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
});
