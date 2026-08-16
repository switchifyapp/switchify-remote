import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';

import { colors } from '@/constants/colors';

const icons = { index: 'computer', remote: 'gamepad', settings: 'settings', diagnostics: 'troubleshoot' } as const;

export default function TabsLayout() {
  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.brand,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 64 },
      tabBarIcon: ({ color, size }) => <MaterialIcons color={color} name={icons[route.name as keyof typeof icons]} size={size} />,
    })}>
      <Tabs.Screen name="index" options={{ title: 'PCs' }} />
      <Tabs.Screen name="remote" options={{ title: 'Remote' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      <Tabs.Screen name="diagnostics" options={{ title: 'Diagnostics' }} />
    </Tabs>
  );
}
