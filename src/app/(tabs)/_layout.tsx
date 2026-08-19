import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';

import { tabDefinitions } from '@/navigation/tabDefinitions';
import { useTheme } from '@/theme/ThemeContext';

const icons = { index: 'computer', remote: 'settings-remote', settings: 'settings' } as const;

export default function TabsLayout() {
  const { colors, scheme } = useTheme();
  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: scheme === 'dark' ? colors.brandText : colors.brand,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 64 },
      tabBarIcon: ({ color, size }) => <MaterialIcons color={color} name={icons[route.name as keyof typeof icons]} size={size} />,
    })}>
      {tabDefinitions.map((tab) => <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />)}
    </Tabs>
  );
}
