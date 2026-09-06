import { render } from '@testing-library/react-native';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import TabsLayout from '@/app/(tabs)/_layout';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: jest.fn() }));
jest.mock('@expo/vector-icons/MaterialIcons', () => () => null);
jest.mock('@/theme/ThemeContext', () => ({
  useTheme: () => ({
    scheme: 'light',
    colors: { brand: '#D90429', brandText: '#FFFFFF', border: '#CCCCCC', surface: '#FFFFFF', textMuted: '#555555' },
  }),
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  function Tabs({ screenOptions, children }: { screenOptions: (input: { route: { name: string } }) => object; children: React.ReactNode }) {
    const resolvedOptions = screenOptions({ route: { name: 'remote' } });
    return React.createElement(View, { testID: 'tabs', accessibilityValue: { text: JSON.stringify(resolvedOptions) } }, children);
  }

  function TabsScreen({ name, options }: { name: string; options: { title: string } }) {
    return React.createElement(View, { testID: `tab-${name}`, accessibilityLabel: options.title });
  }

  Tabs.Screen = TabsScreen;

  return { Tabs };
});

const mockWindowDimensions = useWindowDimensions as jest.MockedFunction<typeof useWindowDimensions>;
const mockSafeAreaInsets = useSafeAreaInsets as jest.MockedFunction<typeof useSafeAreaInsets>;

describe('TabsLayout', () => {
  beforeEach(() => {
    mockWindowDimensions.mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
    mockSafeAreaInsets.mockReturnValue({ top: 0, right: 0, bottom: 24, left: 0 });
  });

  it('applies font scale and the bottom inset to the explicit tab bar height', async () => {
    const view = await render(<TabsLayout />);
    expect(JSON.parse(view.getByTestId('tabs').props.accessibilityValue.text).tabBarStyle.height).toBe(88);

    mockWindowDimensions.mockReturnValue({ width: 844, height: 390, scale: 3, fontScale: 2 });
    mockSafeAreaInsets.mockReturnValue({ top: 0, right: 0, bottom: 34, left: 0 });
    await view.rerender(<TabsLayout />);

    expect(JSON.parse(view.getByTestId('tabs').props.accessibilityValue.text).tabBarStyle.height).toBe(106);
  });

  it('renders the three primary destinations with unchanged labels', async () => {
    const view = await render(<TabsLayout />);
    expect(view.getByTestId('tab-index').props.accessibilityLabel).toBe('PCs');
    expect(view.getByTestId('tab-remote').props.accessibilityLabel).toBe('Remote');
    expect(view.getByTestId('tab-settings').props.accessibilityLabel).toBe('Settings');
  });
});

