import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/constants/colors';

type ScreenProps = PropsWithChildren<{ title: string; description?: string }>;

export function Screen({ title, description, children }: ScreenProps) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.body}>
          <View>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            {description ? <Text style={styles.description}>{description}</Text> : null}
          </View>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { alignItems: 'center', flexGrow: 1, paddingHorizontal: 20, paddingBottom: 32 },
  body: { gap: 20, maxWidth: 760, width: '100%' },
  title: { color: colors.text, fontSize: 34, fontWeight: '800', lineHeight: 41 },
  description: { color: colors.textMuted, fontSize: 17, lineHeight: 25, marginTop: 6 },
});
