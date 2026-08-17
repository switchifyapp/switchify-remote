import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.card} accessible accessibilityLabel={`${title}. ${body}`}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, gap: 8, padding: 20 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  body: { color: colors.textMuted, fontSize: 16, lineHeight: 24 },
});
