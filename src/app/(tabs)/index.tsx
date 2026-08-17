import { Linking, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { useAccessibilityAnnouncement } from '@/components/useAccessibilityAnnouncement';
import { useConnectionManager, useConnectionState } from '@/connection/ConnectionContext';
import { colors } from '@/constants/colors';
import type { SavedPc } from '@/storage/PairingStore';
import type { DiscoveredDesktop } from '@/transport/BleTransport';

export default function PcsScreen() {
  const manager = useConnectionManager();
  const state = useConnectionState();
  const saved = 'saved' in state ? state.saved : [];
  const announcement = state.kind === 'scanning' ? 'Searching for nearby PCs.' : state.kind === 'connecting' ? `Connecting to ${state.desktop.displayName}.` : state.kind === 'reconnecting' ? `Reconnecting to ${state.desktop.displayName}, attempt ${state.attempt}.` : state.kind === 'pairing' ? `Approve the pairing request on your PC. Verification code ${state.verificationCode.split('').join(' ')}.` : state.kind === 'connected' ? `Connected to ${state.desktop.displayName}.` : state.kind === 'failed' ? state.message : null;
  useAccessibilityAnnouncement(announcement);

  return (
    <Screen title="PCs" description="Connect securely to Switchify PC over Bluetooth.">
      {state.kind === 'pairing' ? <View style={styles.pairing} accessible accessibilityLabel={`Approve on your PC. Verification code ${state.verificationCode.split('').join(' ')}. Confirm that this code matches Switchify PC, then approve the request there.`} accessibilityLiveRegion="polite" accessibilityState={{ busy: true }}><Text style={styles.heading}>Approve on your PC</Text><Text importantForAccessibility="no" style={styles.code}>{state.verificationCode}</Text><Text importantForAccessibility="no" style={styles.body}>Confirm that this code matches Switchify PC, then approve the request there.</Text></View> : null}
      {state.kind === 'connected' ? <View style={styles.card}><Text style={styles.heading}>{state.desktop.displayName}</Text><Text style={styles.connected}>Connected</Text><ActionButton label="Disconnect" secondary onPress={() => void manager.disconnect()} /></View> : null}
      {state.kind === 'failed' ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.heading}>Could not connect</Text><Text style={styles.body}>{state.message}</Text></View> : null}
      {state.kind !== 'connected' && state.kind !== 'pairing' && state.kind !== 'connecting' && state.kind !== 'reconnecting' ? <ActionButton label={state.kind === 'scanning' ? 'Searching…' : 'Find nearby PCs'} busy={state.kind === 'scanning'} disabled={state.kind === 'scanning'} onPress={() => void manager.scan()} /> : null}
      {state.kind === 'connecting' || state.kind === 'reconnecting' ? <Text accessibilityLiveRegion="polite" accessibilityState={{ busy: true }} style={styles.body}>{state.kind === 'connecting' ? `Connecting to ${state.desktop.displayName}…` : `Reconnecting to ${state.desktop.displayName}…`}</Text> : null}
      {state.kind === 'permissionDenied' ? <><EmptyState title="Bluetooth permission needed" body="Allow Bluetooth and nearby-device access in system settings, then try again." /><ActionButton label="Open settings" secondary onPress={() => void Linking.openSettings()} /></> : null}
      {state.kind === 'bluetoothOff' ? <EmptyState title="Turn on Bluetooth" body="Turn on Bluetooth, then search again." /> : null}
      {state.kind === 'unsupported' ? <EmptyState title="Bluetooth unavailable" body="This device cannot use the Bluetooth features required by Switchify Remote." /> : null}
      {state.kind === 'scanning' && state.discovered.length === 0 ? <EmptyState title="Looking for PCs" body="Open Switchify PC and keep Bluetooth enabled." /> : null}
      {state.kind === 'scanning' && state.discovered.map((pc) => <PcCard key={pc.desktopId} pc={pc} connect={() => void manager.connect(pc)} />)}
      {saved.length > 0 ? <View style={styles.list}><Text accessibilityRole="header" style={styles.section}>Saved PCs</Text>{saved.map((pc, index) => <SavedPcCard key={pc.desktopId} pc={pc} isDefault={index === 0} connect={() => void manager.connectSaved(pc)} unpair={() => void manager.unpair(pc.desktopId)} />)}</View> : null}
    </Screen>
  );
}

function PcCard({ pc, connect }: { pc: DiscoveredDesktop; connect: () => void }) {
  return <View style={styles.card}><Text style={styles.heading}>{pc.displayName}</Text><Text style={styles.body}>{pc.platform === 'macos' ? 'macOS' : pc.platform === 'windows' ? 'Windows' : 'Switchify PC'}</Text><ActionButton label="Connect" onPress={connect} /></View>;
}

function SavedPcCard({ pc, isDefault, connect, unpair }: { pc: SavedPc; isDefault: boolean; connect: () => void; unpair: () => void }) {
  return <View style={styles.card}><Text style={styles.heading}>{pc.displayName}</Text>{isDefault ? <Text style={styles.connected}>Preferred</Text> : null}<View style={styles.actions}><View style={styles.flex}><ActionButton label={`Connect to ${pc.displayName}`} onPress={connect} /></View><View style={styles.flex}><ActionButton label={`Unpair ${pc.displayName}`} secondary onPress={unpair} /></View></View></View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, gap: 12, padding: 18 },
  pairing: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.brand, borderRadius: 20, borderWidth: 2, gap: 10, padding: 22 },
  error: { backgroundColor: colors.surface, borderColor: colors.danger, borderRadius: 20, borderWidth: 1, gap: 8, padding: 18 },
  heading: { color: colors.text, fontSize: 20, fontWeight: '700' }, body: { color: colors.textMuted, fontSize: 16, lineHeight: 24 },
  code: { color: colors.text, fontSize: 38, fontVariant: ['tabular-nums'], fontWeight: '800', letterSpacing: 6 }, connected: { color: colors.success, fontSize: 16, fontWeight: '700' },
  list: { gap: 12 }, section: { color: colors.text, fontSize: 22, fontWeight: '800' }, actions: { flexDirection: 'row', gap: 10 }, flex: { flex: 1 },
});
