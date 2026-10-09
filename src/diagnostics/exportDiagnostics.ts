import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export async function exportDiagnostics(contents: string): Promise<void> {
  if (!FileSystem.cacheDirectory || !await Sharing.isAvailableAsync()) return;
  const path = `${FileSystem.cacheDirectory}switchify-remote-diagnostics.txt`;
  await FileSystem.writeAsStringAsync(path, contents);
  await Sharing.shareAsync(path, { mimeType: 'text/plain', dialogTitle: 'Export Switchify Remote diagnostics' });
}
