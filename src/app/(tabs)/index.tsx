import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Linking, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { StatusBadge } from '@/components/StatusBadge';
import { useAccessibilityAnnouncement } from '@/components/useAccessibilityAnnouncement';
import { useConnectionManager, useConnectionState } from '@/connection/ConnectionContext';
import { mergePcList, pcListAction, type PcListItem } from '@/connection/pcList';
import { shouldUseTwoColumns, useLayout, useTheme } from '@/theme/ThemeContext';

export default function PcsScreen() {
  const manager = useConnectionManager();
  const state = useConnectionState();
  const layout = useLayout();
  const twoColumns = shouldUseTwoColumns(layout);
  const { colors, spacing } = useTheme();
  const saved = 'saved' in state ? state.saved : [];
  const discovered = state.kind === 'scanning' ? state.discovered : [];
  const pcs = mergePcList(saved, discovered);
  const announcement = state.kind === 'scanning' ? 'Searching for nearby PCs.' : state.kind === 'connecting' ? `Connecting to ${state.desktop.displayName}.` : state.kind === 'reconnecting' ? `Reconnecting to ${state.desktop.displayName}, attempt ${state.attempt}.` : state.kind === 'pairing' ? `Approve the pairing request on your PC. Verification code ${state.verificationCode.split('').join(' ')}.` : state.kind === 'connected' ? `Connected to ${state.desktop.displayName}.` : state.kind === 'failed' ? `Connection failed. ${state.message}` : state.kind === 'permissionDenied' ? 'Bluetooth permission needed. Allow Bluetooth and nearby-device access in system settings, then try again.' : state.kind === 'bluetoothOff' ? 'Turn on Bluetooth, then search again.' : state.kind === 'unsupported' ? 'Bluetooth is unavailable on this device.' : null;
  useAccessibilityAnnouncement(announcement);

  return <Screen title="PCs" description="Connect securely to Switchify PC over Bluetooth.">
    {state.kind === 'pairing' ? <Card variant="hero"><StatusBadge icon="verified-user" label="Secure pairing" tone="brand" /><AppText accessibilityRole="header" variant="title">Approve on your PC</AppText><AppText accessibilityLabel={state.verificationCode.split('').join(' ')} variant="code">{state.verificationCode}</AppText><AppText muted>Confirm that this code matches Switchify PC, then approve the request there.</AppText></Card> : null}
    {state.kind === 'connected' ? <Card variant="hero"><View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.md }}><MaterialIcons color={colors.brandText} importantForAccessibility="no" name="computer" size={28} /><View style={{ flex: 1, gap: spacing.xs }}><AppText variant="title">{state.desktop.displayName}</AppText><StatusBadge icon="check-circle" label="Connected" tone="success" /></View></View><ActionButton icon="link-off" label="Disconnect" tone="secondary" onPress={() => void manager.disconnect()} /></Card> : null}
    {state.kind === 'connecting' || state.kind === 'reconnecting' ? <Card variant="hero"><StatusBadge icon="sync" label={state.kind === 'connecting' ? 'Connecting' : `Reconnect attempt ${state.attempt}`} tone="brand" /><AppText variant="title">{state.desktop.displayName}</AppText><AppText muted>{state.kind === 'connecting' ? `Connecting to ${state.desktop.displayName}…` : `Reconnecting to ${state.desktop.displayName}…`}</AppText></Card> : null}
    {state.kind === 'failed' ? <Card variant="danger"><StatusBadge icon="error-outline" label="Connection failed" tone="danger" /><AppText variant="title">Could not connect</AppText><AppText muted>{state.message}</AppText></Card> : null}
    {state.kind !== 'connected' && state.kind !== 'pairing' && state.kind !== 'connecting' && state.kind !== 'reconnecting' ? <ActionButton icon="bluetooth-searching" label={state.kind === 'scanning' ? 'Searching…' : 'Find nearby PCs'} busy={state.kind === 'scanning'} disabled={state.kind === 'scanning'} onPress={() => void manager.scan()} /> : null}
    {state.kind === 'permissionDenied' ? <EmptyState icon="settings-bluetooth" title="Bluetooth permission needed" body="Allow Bluetooth and nearby-device access in system settings, then try again." action={<ActionButton label="Open settings" tone="secondary" onPress={() => void Linking.openSettings()} />} /> : null}
    {state.kind === 'bluetoothOff' ? <EmptyState icon="bluetooth-disabled" title="Turn on Bluetooth" body="Turn on Bluetooth, then search again." /> : null}
    {state.kind === 'unsupported' ? <EmptyState icon="block" title="Bluetooth unavailable" body="This device cannot use the Bluetooth features required by Switchify Remote." /> : null}
    {state.kind === 'scanning' && discovered.length === 0 ? <EmptyState icon="radar" title="Looking for PCs" body="Open Switchify PC and keep Bluetooth enabled." /> : null}
    {pcs.length > 0 ? <View style={{ gap: spacing.md }}><AppText accessibilityRole="header" variant="title">PCs</AppText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>{pcs.map((pc, index) => <View key={pc.desktopId} style={{ flexBasis: twoColumns ? '47%' : '100%', flexGrow: 1 }}><PcCard pc={pc} preferred={pc.saved !== null && index === 0} connect={() => { if (pc.saved) void manager.connectSaved({ ...pc.saved, displayName: pc.displayName, platform: pc.platform, peripheralId: pc.peripheralId }); else void manager.connect(pc); }} unpair={pc.saved ? () => void manager.unpair(pc.desktopId) : null} /></View>)}</View></View> : null}
  </Screen>;
}

function PcCard({ pc, preferred, connect, unpair }: { pc: PcListItem; preferred: boolean; connect: () => void; unpair: (() => void) | null }) {
  const { spacing } = useTheme();
  const platform = pc.platform === 'macos' ? 'macOS' : pc.platform === 'windows' ? 'Windows' : 'Switchify PC';
  const status = pc.saved ? (pc.nearby ? 'Saved and nearby' : 'Saved PC') : 'New PC';
  return <Card><View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' }}><AppText variant="title">{pc.displayName}</AppText>{preferred ? <StatusBadge icon="star" label="Preferred" tone="brand" /> : null}</View><StatusBadge icon={pc.nearby ? 'bluetooth-connected' : 'computer'} label={`${platform} · ${status}`} /><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}><View style={{ flex: 1, minWidth: 120 }}><ActionButton label={pcListAction(pc)} onPress={connect} /></View>{unpair ? <View style={{ flex: 1, minWidth: 120 }}><ActionButton icon="link-off" label={`Unpair ${pc.displayName}`} tone="tertiary" onPress={unpair} /></View> : null}</View></Card>;
}
