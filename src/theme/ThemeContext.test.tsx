import { render } from '@testing-library/react-native';
import { Text, useColorScheme, useWindowDimensions } from 'react-native';
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
});
