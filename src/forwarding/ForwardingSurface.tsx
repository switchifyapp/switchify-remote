import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import type { SwitchifyBridge } from '@/bridge/types';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ControlButton } from '@/components/ControlButton';
import type { ConnectionManager } from '@/connection/ConnectionManager';
import type { PointerProfile } from '@/domain/protocol/types';
import { preferencesStore, type Preferences } from '@/storage/PreferencesStore';
import { useTheme } from '@/theme/ThemeContext';
import { ForwardingController } from './ForwardingController';

export type ForwardingRestoreIntent = { desktopId: string; profileId: string; profileVersion: number };
export class ForwardingRestoreState {
  #intent: ForwardingRestoreIntent | null = null;
  get(): ForwardingRestoreIntent | null { return this.#intent; }
  set(intent: ForwardingRestoreIntent | null): void { this.#intent = intent; }
  clear(): void { this.#intent = null; }
}

export function shouldClearForwardingRestore(surface: string, connectionKind: string): boolean {
  return surface !== 'forwarding' || (connectionKind !== 'connected' && connectionKind !== 'reconnecting');
}

export function ForwardingSurface({ manager, bridge, profile, desktopId, preferences, restore }: { manager: ConnectionManager; bridge: SwitchifyBridge; profile: PointerProfile; desktopId: string; preferences: Preferences; restore: ForwardingRestoreState }) {
  const { colors, radii, spacing } = useTheme();
  const controller = useMemo(() => new ForwardingController(
    manager,
    bridge,
    profile,
    preferences.forwardingHoldToStopMs,
    undefined,
    undefined,
    () => { restore.clear(); },
  ), [manager, bridge, profile, preferences.forwardingHoldToStopMs, restore]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const [rememberedProfileId] = useState(() => preferences.forwardingProfiles[desktopId]);
  useEffect(() => {
    void controller.loadProfiles(rememberedProfileId).then(async () => {
      const restoreIntent = restore.get();
      if (restoreIntent?.desktopId !== desktopId) return;
      const selected = controller.selectedProfile();
      if (selected?.id !== restoreIntent.profileId || selected.version !== restoreIntent.profileVersion) {
        restore.clear();
        controller.report('The previously active forwarding profile changed. Start forwarding again to confirm it.');
        return;
      }
      await controller.start();
    });
    const unregister = manager.registerCleanup(async () => { restore.clear(); await controller.cleanup(); });
    return () => { unregister(); void controller.cleanup(); };
  }, [controller, desktopId, manager, rememberedProfileId, restore]);
  const select = async (profileId: string) => {
    try {
      await preferencesStore.update({ forwardingProfiles: { ...preferencesStore.snapshot().forwardingProfiles, [desktopId]: profileId } });
      controller.selectProfile(profileId);
    } catch {
      controller.report('Could not save the forwarding profile selection.');
    }
  };
  return <View style={{ gap: spacing.md }}>
    <AppText accessibilityRole="header" variant="title">PC Switch Forwarding</AppText>
    <AppText muted>Forward configured external switches from Switchify to this PC.</AppText>
    {state.profiles.map((item) => <ControlButton key={item.id} label={item.name} selected={state.selectedProfileId === item.id} disabled={state.phase === 'starting' || state.phase === 'active'} onPress={() => select(item.id)} />)}
    <ControlButton label={state.phase === 'active' ? 'Stop forwarding' : 'Start forwarding'} disabled={state.phase === 'starting' || state.profiles.length === 0} danger={state.phase === 'active'} onPress={() => {
      if (state.phase === 'active') { restore.clear(); void controller.stop(); }
      else void controller.start().then((started) => {
        const selected = controller.selectedProfile();
        if (started && selected) restore.set({ desktopId, profileId: selected.id, profileVersion: selected.version });
      });
    }} />
    {state.message ? <AppText accessibilityLiveRegion="polite" style={{ color: colors.warning }}>{state.message}</AppText> : null}
    {state.overflow.length ? <AppText style={{ color: colors.warning }}>{state.overflow.length} additional switches are not forwarded. Only the first eight are supported.</AppText> : null}
    <Card>{state.mappings.map((mapping) => <View key={mapping.keyCode} accessible accessibilityLabel={`${mapping.name}, ${mapping.outputLabel ?? 'unassigned'}, ${mapping.pressed ? 'pressed' : 'released'}`} style={{ backgroundColor: mapping.pressed ? colors.brandTint : colors.surface, borderColor: mapping.pressed ? colors.brand : colors.border, borderRadius: radii.md, borderWidth: mapping.pressed ? 2 : 1, flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', padding: spacing.md }}><AppText>{mapping.name}</AppText><AppText muted>{mapping.outputLabel ?? 'Unassigned'}{mapping.pressed ? ' · Pressed' : ''}</AppText></View>)}</Card>
  </View>;
}
