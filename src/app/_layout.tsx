import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BridgeProvider } from '@/bridge/BridgeContext';
import { ConnectionProvider } from '@/connection/ConnectionContext';
import { ThemeProvider, useTheme } from '@/theme/ThemeContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider><ThemedApp /></ThemeProvider>
    </SafeAreaProvider>
  );
}

function ThemedApp() {
  const { colors, scheme } = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: colors.background, card: colors.surface, primary: colors.brand, text: colors.text, border: colors.border } };
  return (
    <BridgeProvider>
      <ConnectionProvider>
        <NavigationThemeProvider value={theme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="diagnostics" options={{ headerShown: true, title: 'Diagnostics' }} />
          </Stack>
          <StatusBar style="auto" />
        </NavigationThemeProvider>
      </ConnectionProvider>
    </BridgeProvider>
  );
}
