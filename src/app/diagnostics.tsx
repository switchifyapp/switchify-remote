import * as Clipboard from 'expo-clipboard';
import { useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { ResponsiveGrid } from '@/components/ResponsiveGrid';
import { useConnectionManager } from '@/connection/ConnectionContext';
import { exportDiagnostics } from '@/diagnostics/exportDiagnostics';
import { useTheme } from '@/theme/ThemeContext';

export default function DiagnosticsScreen() {
  const log = useConnectionManager().diagnostics;
  const entries = useSyncExternalStore(log.subscribe, log.snapshot, log.snapshot);
  const { colors, spacing } = useTheme();
  return (
    <Screen nativeHeader title="Diagnostics">
      <AppText muted>Activity stays on this device. Typed text and credentials are never recorded.</AppText>
      <ResponsiveGrid minItemWidth={130}>
        <ActionButton icon="content-copy" label="Copy" disabled={entries.length === 0} onPress={() => void Clipboard.setStringAsync(log.export())} />
        <ActionButton icon="share" label="Export" tone="secondary" disabled={entries.length === 0} onPress={() => void exportDiagnostics(log.export())} />
        <ActionButton icon="delete-outline" label="Clear" tone="danger" disabled={entries.length === 0} onPress={() => log.clear()} />
      </ResponsiveGrid>
      {entries.length === 0 ? <EmptyState icon="history" title="No activity yet" body="Sanitized connection events will appear here." /> : <Card style={{ gap: 0, padding: 0 }}>{entries.map((entry, index) => <View key={entry.id} style={{ borderTopColor: colors.border, borderTopWidth: index === 0 ? 0 : 1, gap: spacing.xs, padding: spacing.lg }}><AppText muted variant="caption">{new Date(entry.timestamp).toLocaleTimeString()}</AppText><AppText>{entry.message}</AppText></View>)}</Card>}
    </Screen>
  );
}
