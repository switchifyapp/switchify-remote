import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/constants/colors';
import { ConnectionProvider } from '@/connection/ConnectionContext';

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.surface, primary: colors.brand, text: colors.text, border: colors.border },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ConnectionProvider>
        <ThemeProvider value={theme}>
          <Stack screenOptions={{ headerShown: false }} />
          <StatusBar style="light" />
        </ThemeProvider>
      </ConnectionProvider>
    </SafeAreaProvider>
  );
}
