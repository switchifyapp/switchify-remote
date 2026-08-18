import { Linking, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { useAccessibilityAnnouncement } from '@/components/useAccessibilityAnnouncement';
import { useConnectionManager, useConnectionState } from '@/connection/ConnectionContext';
import { mergePcList, pcListAction, type PcListItem } from '@/connection/pcList';
import { colors } from '@/constants/colors';

export default function PcsScreen() {
  const manager = useConnectionManager();
  const state = useConnectionState();
  const saved = 'saved' in state ? state.saved : [];
  const discovered = state.kind === 'scanning' ? state.discovered : [];
  const pcs = mergePcList(saved, discovered);
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
      {state.kind === 'scanning' && discovered.length === 0 ? <EmptyState title="Looking for PCs" body="Open Switchify PC and keep Bluetooth enabled." /> : null}
      {pcs.length > 0 ? <View style={styles.list}><Text accessibilityRole="header" style={styles.section}>PCs</Text>{pcs.map((pc, index) => <PcCard key={pc.desktopId} pc={pc} preferred={pc.saved !== null && index === 0} connect={() => { if (pc.saved) void manager.connectSaved({ ...pc.saved, displayName: pc.displayName, platform: pc.platform, peripheralId: pc.peripheralId }); else void manager.connect(pc); }} unpair={pc.saved ? () => void manager.unpair(pc.desktopId) : null} />)}</View> : null}
    </Screen>
  );
}

function PcCard({ pc, preferred, connect, unpair }: { pc: PcListItem; preferred: boolean; connect: () => void; unpair: (() => void) | null }) {
  const platform = pc.platform === 'macos' ? 'macOS' : pc.platform === 'windows' ? 'Windows' : 'Switchify PC';
  const status = pc.saved ? (pc.nearby ? 'Saved and nearby' : 'Saved PC') : 'New PC';
  return <View style={styles.card}><Text style={styles.heading}>{pc.displayName}</Text>{preferred ? <Text style={styles.connected}>Preferred</Text> : null}<Text style={styles.body}>{platform} · {status}</Text><View style={styles.actions}><View style={styles.flex}><ActionButton label={pcListAction(pc)} onPress={connect} /></View>{unpair ? <View style={styles.flex}><ActionButton label={`Unpair ${pc.displayName}`} secondary onPress={unpair} /></View> : null}</View></View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, gap: 12, padding: 18 },
  pairing: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.brand, borderRadius: 20, borderWidth: 2, gap: 10, padding: 22 },
  error: { backgroundColor: colors.surface, borderColor: colors.danger, borderRadius: 20, borderWidth: 1, gap: 8, padding: 18 },
  heading: { color: colors.text, fontSize: 20, fontWeight: '700' }, body: { color: colors.textMuted, fontSize: 16, lineHeight: 24 },
  code: { color: colors.text, fontSize: 38, fontVariant: ['tabular-nums'], fontWeight: '800', letterSpacing: 6 }, connected: { color: colors.success, fontSize: 16, fontWeight: '700' },
  list: { gap: 12 }, section: { color: colors.text, fontSize: 22, fontWeight: '800' }, actions: { flexDirection: 'row', gap: 10 }, flex: { flex: 1 },
});
