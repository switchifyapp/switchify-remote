import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/constants/colors';

type ScreenProps = PropsWithChildren<{ title: string; description?: string }>;

export function Screen({ title, description, children }: ScreenProps) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View accessibilityRole="header">
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, gap: 20, paddingHorizontal: 20, paddingBottom: 32 },
  title: { color: colors.text, fontSize: 34, fontWeight: '800', lineHeight: 41 },
  description: { color: colors.textMuted, fontSize: 17, lineHeight: 25, marginTop: 6 },
});
