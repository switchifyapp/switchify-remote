import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SwitchifyBridge } from '@/bridge/types';
import { ControlButton } from '@/components/ControlButton';
import { colors } from '@/constants/colors';
import type { ConnectionManager } from '@/connection/ConnectionManager';
import type { PointerProfile } from '@/domain/protocol/types';
import { preferencesStore, type Preferences } from '@/storage/PreferencesStore';
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
  return <View style={styles.root}>
    <Text accessibilityRole="header" style={styles.heading}>PC Switch Forwarding</Text>
    <Text style={styles.body}>Forward configured external switches from Switchify to this PC.</Text>
    {state.profiles.map((item) => <ControlButton key={item.id} label={item.name} selected={state.selectedProfileId === item.id} disabled={state.phase === 'active'} onPress={() => select(item.id)} />)}
    <ControlButton label={state.phase === 'active' ? 'Stop forwarding' : 'Start forwarding'} disabled={state.phase === 'starting' || state.profiles.length === 0} danger={state.phase === 'active'} onPress={() => {
      if (state.phase === 'active') { restore.clear(); void controller.stop(); }
      else void controller.start().then((started) => {
        const selected = controller.selectedProfile();
        if (started && selected) restore.set({ desktopId, profileId: selected.id, profileVersion: selected.version });
      });
    }} />
    {state.message ? <Text accessibilityLiveRegion="polite" style={styles.warning}>{state.message}</Text> : null}
    {state.overflow.length ? <Text style={styles.warning}>{state.overflow.length} additional switches are not forwarded. Only the first eight are supported.</Text> : null}
    {state.mappings.map((mapping) => <View key={mapping.keyCode} accessible accessibilityLabel={`${mapping.name}, ${mapping.outputLabel ?? 'unassigned'}, ${mapping.pressed ? 'pressed' : 'released'}`} style={[styles.mapping, mapping.pressed && styles.pressed]}><Text style={styles.body}>{mapping.name}</Text><Text style={styles.output}>{mapping.outputLabel ?? 'Unassigned'}</Text></View>)}
  </View>;
}

const styles = StyleSheet.create({ root: { gap: 10 }, heading: { color: colors.text, fontSize: 22, fontWeight: '800' }, body: { color: colors.text, fontSize: 16 }, warning: { color: colors.warning, fontSize: 16 }, mapping: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 14 }, pressed: { borderColor: colors.brand, borderWidth: 3 }, output: { color: colors.textMuted, fontSize: 16 } });
