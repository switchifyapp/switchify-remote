import { StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { useConnectionManager, useConnectionState } from '@/connection/ConnectionContext';
import { colors } from '@/constants/colors';
import type { SavedPc } from '@/storage/PairingStore';
import type { DiscoveredDesktop } from '@/transport/BleTransport';

export default function PcsScreen() {
  const manager = useConnectionManager();
  const state = useConnectionState();
  const saved = 'saved' in state ? state.saved : [];

  return (
    <Screen title="PCs" description="Connect securely to Switchify PC over Bluetooth.">
      {state.kind === 'pairing' ? <View style={styles.pairing} accessible accessibilityLiveRegion="polite"><Text style={styles.heading}>Approve on your PC</Text><Text style={styles.code}>{state.verificationCode}</Text><Text style={styles.body}>Confirm that this code matches Switchify PC, then approve the request there.</Text></View> : null}
      {state.kind === 'connected' ? <View style={styles.card}><Text style={styles.heading}>{state.desktop.displayName}</Text><Text style={styles.connected}>Connected</Text><ActionButton label="Disconnect" secondary onPress={() => void manager.disconnect()} /></View> : null}
      {state.kind === 'failed' ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.heading}>Could not connect</Text><Text style={styles.body}>{state.message}</Text></View> : null}
      {state.kind !== 'connected' && state.kind !== 'pairing' && state.kind !== 'connecting' ? <ActionButton label={state.kind === 'scanning' ? 'Searching…' : 'Find nearby PCs'} disabled={state.kind === 'scanning'} onPress={() => void manager.scan()} /> : null}
      {state.kind === 'connecting' ? <Text accessibilityLiveRegion="polite" style={styles.body}>Connecting to {state.desktop.displayName}…</Text> : null}
      {state.kind === 'permissionDenied' ? <EmptyState title="Bluetooth permission needed" body="Allow nearby-device access in system settings, then try again." /> : null}
      {state.kind === 'scanning' && state.discovered.length === 0 ? <EmptyState title="Looking for PCs" body="Open Switchify PC and keep Bluetooth enabled." /> : null}
      {state.kind === 'scanning' && state.discovered.map((pc) => <PcCard key={pc.desktopId} pc={pc} connect={() => void manager.connect(pc)} />)}
      {saved.length > 0 ? <View style={styles.list}><Text accessibilityRole="header" style={styles.section}>Saved PCs</Text>{saved.map((pc) => <SavedPcCard key={pc.desktopId} pc={pc} connect={() => void manager.connectSaved(pc)} unpair={() => void manager.unpair(pc.desktopId)} />)}</View> : null}
    </Screen>
  );
}

function PcCard({ pc, connect }: { pc: DiscoveredDesktop; connect: () => void }) {
  return <View style={styles.card}><Text style={styles.heading}>{pc.displayName}</Text><Text style={styles.body}>{pc.platform === 'macos' ? 'macOS' : pc.platform === 'windows' ? 'Windows' : 'Switchify PC'}</Text><ActionButton label="Connect" onPress={connect} /></View>;
}

function SavedPcCard({ pc, connect, unpair }: { pc: SavedPc; connect: () => void; unpair: () => void }) {
  return <View style={styles.card}><Text style={styles.heading}>{pc.displayName}</Text><View style={styles.actions}><View style={styles.flex}><ActionButton label="Connect" onPress={connect} /></View><View style={styles.flex}><ActionButton label="Unpair" secondary onPress={unpair} /></View></View></View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, gap: 12, padding: 18 },
  pairing: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.brand, borderRadius: 20, borderWidth: 2, gap: 10, padding: 22 },
  error: { backgroundColor: colors.surface, borderColor: colors.danger, borderRadius: 20, borderWidth: 1, gap: 8, padding: 18 },
  heading: { color: colors.text, fontSize: 20, fontWeight: '700' },
  body: { color: colors.textMuted, fontSize: 16, lineHeight: 24 },
  code: { color: colors.text, fontSize: 38, fontVariant: ['tabular-nums'], fontWeight: '800', letterSpacing: 6 },
  connected: { color: colors.success, fontSize: 16, fontWeight: '700' },
  list: { gap: 12 }, section: { color: colors.text, fontSize: 22, fontWeight: '800' }, actions: { flexDirection: 'row', gap: 10 }, flex: { flex: 1 },
});
