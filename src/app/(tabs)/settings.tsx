import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { ControlButton } from '@/components/ControlButton';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { useConnectionManager, useConnectionState } from '@/connection/ConnectionContext';
import { colors } from '@/constants/colors';
import type { SavedPc } from '@/storage/PairingStore';
import { preferencesStore } from '@/storage/PreferencesStore';
import { usePreferences } from '@/storage/usePreferences';

export default function SettingsScreen() {
  const manager = useConnectionManager();
  const connection = useConnectionState();
  const preferences = usePreferences();
  const [saved, setSaved] = useState<SavedPc[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  useEffect(() => { void Promise.all([manager.listSaved(), manager.defaultDesktopId()]).then(([pcs, id]) => { setSaved(pcs); setDefaultId(id); }); }, [manager, connection]);
  const setDefault = async (id: string | null) => { await manager.setDefaultDesktopId(id); setDefaultId(id); };
  return (
    <Screen title="Settings" description="Preferences are stored only on this device.">
      <Text accessibilityRole="header" style={styles.heading}>Opening surface</Text><View style={styles.row}>{(Platform.OS === 'android' ? ['mouse', 'typing', 'window', 'forwarding'] as const : ['mouse', 'typing', 'window'] as const).map((surface) => <ControlButton key={surface} label={surface[0]!.toUpperCase() + surface.slice(1)} selected={preferences.surface === surface} onPress={() => void preferencesStore.update({ surface })} />)}</View>
      <Text accessibilityRole="header" style={styles.heading}>Typing mode</Text><View style={styles.row}><ControlButton label="Live" selected={preferences.typingMode === 'live'} onPress={() => void preferencesStore.update({ typingMode: 'live' })} /><ControlButton label="Draft" selected={preferences.typingMode === 'draft'} onPress={() => void preferencesStore.update({ typingMode: 'draft' })} /></View>
      <Text accessibilityRole="header" style={styles.heading}>Default PC</Text>
      {saved.length === 0 ? <EmptyState title="No saved PCs" body="Pair a PC before choosing a default." /> : <><ControlButton label="Most recently connected" selected={defaultId === null} onPress={() => void setDefault(null)} />{saved.map((pc) => <ControlButton key={pc.desktopId} label={pc.displayName} selected={defaultId === pc.desktopId} onPress={() => void setDefault(pc.desktopId)} />)}</>}
      <Text accessibilityRole="header" style={styles.heading}>Pointer controls</Text>
      {connection.kind === 'connected' && connection.profile ? <View style={styles.summary}><Text style={styles.summaryText}>Speed: {connection.profile.capabilities.pointerSpeed.scalePercent}%</Text><Text style={styles.summaryText}>Movement repeat: {connection.profile.capabilities.mouseRepeat.enabled ? 'On' : 'Off'}</Text><Text style={styles.summaryText}>Displays: {connection.profile.capabilities.displayNavigation.displayCount}</Text></View> : <EmptyState title="Connect a PC" body="Supported pointer controls are provided by the connected computer." />}
      {Platform.OS === 'android' ? <><Text accessibilityRole="header" style={styles.heading}>Forwarding hold to stop</Text><View style={styles.row}>{[3_000, 5_000, 8_000].map((milliseconds) => <ControlButton key={milliseconds} label={`${milliseconds / 1000} seconds`} selected={preferences.forwardingHoldToStopMs === milliseconds} onPress={() => void preferencesStore.update({ forwardingHoldToStopMs: milliseconds })} />)}</View></> : null}
    </Screen>
  );
}
const styles = StyleSheet.create({ heading: { color: colors.text, fontSize: 20, fontWeight: '800' }, row: { flexDirection: 'row', gap: 8 }, summary: { backgroundColor: colors.surface, borderRadius: 16, gap: 8, padding: 16 }, summaryText: { color: colors.text, fontSize: 16 } });
