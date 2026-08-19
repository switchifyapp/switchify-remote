import { type ReactNode, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ControlButton } from '@/components/ControlButton';
import { DiagnosticsLink } from '@/components/DiagnosticsLink';
import { EmptyState } from '@/components/EmptyState';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { useConnectionManager, useConnectionState } from '@/connection/ConnectionContext';
import type { SavedPc } from '@/storage/PairingStore';
import { preferencesStore } from '@/storage/PreferencesStore';
import { usePreferences } from '@/storage/usePreferences';
import { shouldUseTwoColumns, useLayout, useTheme } from '@/theme/ThemeContext';

export default function SettingsScreen() {
  const manager = useConnectionManager();
  const connection = useConnectionState();
  const preferences = usePreferences();
  const layout = useLayout();
  const twoColumns = shouldUseTwoColumns(layout);
  const { spacing } = useTheme();
  const [saved, setSaved] = useState<SavedPc[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  useEffect(() => { void Promise.all([manager.listSaved(), manager.defaultDesktopId()]).then(([pcs, id]) => { setSaved(pcs); setDefaultId(id); }); }, [manager, connection]);
  const setDefault = async (id: string | null) => { await manager.setDefaultDesktopId(id); setDefaultId(id); };
  const cardWidth = { flexBasis: twoColumns ? '47%' as const : '100%' as const, flexGrow: 1 };
  return <Screen title="Settings" description="Preferences are stored only on this device.">
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
      <View style={cardWidth}><SettingCard title="Opening surface" description="Shown first when the remote connects."><ChoiceRow>{(Platform.OS === 'android' ? ['mouse', 'typing', 'window', 'forwarding'] as const : ['mouse', 'typing', 'window'] as const).map((surface) => <ControlButton key={surface} label={surface[0]!.toUpperCase() + surface.slice(1)} selected={preferences.surface === surface} onPress={() => void preferencesStore.update({ surface })} />)}</ChoiceRow></SettingCard></View>
      <View style={cardWidth}><SettingCard title="Typing mode" description="Choose whether text sends live or as a draft."><ChoiceRow><ControlButton label="Live" selected={preferences.typingMode === 'live'} onPress={() => void preferencesStore.update({ typingMode: 'live' })} /><ControlButton label="Draft" selected={preferences.typingMode === 'draft'} onPress={() => void preferencesStore.update({ typingMode: 'draft' })} /></ChoiceRow></SettingCard></View>
      <View style={cardWidth}><SettingCard title="Default PC" description="Select the computer used for automatic connection.">{saved.length === 0 ? <EmptyState icon="computer" title="No saved PCs" body="Pair a PC before choosing a default." /> : <View style={{ gap: spacing.sm }}><ControlButton label="Most recently connected" selected={defaultId === null} onPress={() => void setDefault(null)} />{saved.map((pc) => <ControlButton key={pc.desktopId} label={pc.displayName} selected={defaultId === pc.desktopId} onPress={() => void setDefault(pc.desktopId)} />)}</View>}</SettingCard></View>
      <View style={cardWidth}><SettingCard title="Pointer controls" description="Capabilities reported by the connected computer.">{connection.kind === 'connected' && connection.profile ? <View><ListRow icon="speed" title="Pointer speed" description={`${connection.profile.capabilities.pointerSpeed.scalePercent}%`} /><ListRow icon="repeat" title="Movement repeat" description={connection.profile.capabilities.mouseRepeat.enabled ? 'On' : 'Off'} /><ListRow icon="desktop-windows" title="Displays" description={`${connection.profile.capabilities.displayNavigation.displayCount}`} /></View> : <EmptyState icon="link" title="Connect a PC" body="Supported pointer controls are provided by the connected computer." />}</SettingCard></View>
      {Platform.OS === 'android' ? <View style={cardWidth}><SettingCard title="Forwarding hold to stop" description="How long a physical switch must be held."><ChoiceRow>{[3_000, 5_000, 8_000].map((milliseconds) => <ControlButton key={milliseconds} label={`${milliseconds / 1000} seconds`} selected={preferences.forwardingHoldToStopMs === milliseconds} onPress={() => void preferencesStore.update({ forwardingHoldToStopMs: milliseconds })} />)}</ChoiceRow></SettingCard></View> : null}
      <View style={cardWidth}><Card><DiagnosticsLink /></Card></View>
    </View>
  </Screen>;
}

function SettingCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const { spacing } = useTheme();
  return <Card><View style={{ gap: spacing.xs }}><AppText accessibilityRole="header" variant="heading">{title}</AppText><AppText muted variant="caption">{description}</AppText></View>{children}</Card>;
}

function ChoiceRow({ children }: { children: ReactNode }) {
  const { spacing } = useTheme();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{children}</View>;
}
