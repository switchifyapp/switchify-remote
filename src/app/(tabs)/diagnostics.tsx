import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { useConnectionManager } from '@/connection/ConnectionContext';
import { colors } from '@/constants/colors';

export default function DiagnosticsScreen() {
  const log = useConnectionManager().diagnostics;
  const entries = useSyncExternalStore(log.subscribe, log.snapshot, log.snapshot);
  return (
    <Screen title="Diagnostics" description="Activity stays on this device. Typed text and credentials are never recorded.">
      <View style={styles.actions}><View style={styles.flex}><ActionButton label="Copy" disabled={entries.length === 0} onPress={() => void Clipboard.setStringAsync(log.export())} /></View><View style={styles.flex}><ActionButton label="Export" secondary disabled={entries.length === 0} onPress={() => void exportDiagnostics(log.export())} /></View><View style={styles.flex}><ActionButton label="Clear" secondary disabled={entries.length === 0} onPress={() => log.clear()} /></View></View>
      {entries.length === 0 ? <EmptyState title="No activity yet" body="Sanitized connection events will appear here." /> : entries.map((entry) => <View key={entry.id} style={styles.entry}><Text style={styles.time}>{new Date(entry.timestamp).toLocaleTimeString()}</Text><Text style={styles.message}>{entry.message}</Text></View>)}
    </Screen>
  );
}

async function exportDiagnostics(contents: string): Promise<void> {
  if (!FileSystem.cacheDirectory || !await Sharing.isAvailableAsync()) return;
  const path = `${FileSystem.cacheDirectory}switchify-remote-diagnostics.txt`;
  await FileSystem.writeAsStringAsync(path, contents);
  await Sharing.shareAsync(path, { mimeType: 'text/plain', dialogTitle: 'Export Switchify Remote diagnostics' });
}

const styles = StyleSheet.create({ actions: { flexDirection: 'row', gap: 10 }, flex: { flex: 1 }, entry: { backgroundColor: colors.surface, borderRadius: 14, gap: 4, padding: 14 }, time: { color: colors.textMuted, fontSize: 13 }, message: { color: colors.text, fontSize: 16 } });
