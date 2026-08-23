import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Modal, Platform, Pressable, ScrollView, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { AppText } from '@/components/AppText';
import { ControlButton } from '@/components/ControlButton';
import { EmptyState } from '@/components/EmptyState';
import { focusAccessibilityTarget } from '@/components/accessibilityFocus';
import type { ConnectionManager, ConnectionState } from '@/connection/ConnectionManager';
import type { SavedPc } from '@/storage/PairingStore';
import { useTheme } from '@/theme/ThemeContext';

type SwitcherManager = Pick<ConnectionManager, 'listSaved' | 'switchSaved'>;

export type RemoteDevicePresentation = { name: string; status: string };

export function remoteDevicePresentation(connection: ConnectionState): RemoteDevicePresentation {
  if (connection.kind === 'connected') return { name: connection.desktop.displayName, status: 'Connected' };
  if (connection.kind === 'connecting') return { name: connection.desktop.displayName, status: 'Connecting' };
  if (connection.kind === 'reconnecting') return { name: connection.desktop.displayName, status: 'Reconnecting' };
  if (connection.kind === 'pairing') return { name: connection.desktop.displayName, status: 'Pairing' };
  return { name: 'Choose PC', status: 'Not connected' };
}

export function RemoteDeviceSwitcher({ connection, manager, managePcs }: { connection: ConnectionState; manager: SwitcherManager; managePcs: () => void }) {
  const { colors, radii, reducedMotion, spacing } = useTheme();
  const [saved, setSaved] = useState<SavedPc[] | null>(null);
  const [visible, setVisible] = useState(false);
  const buttonRef = useRef<View>(null);
  const selectedOptionRef = useRef<View>(null);
  const firstOptionRef = useRef<View>(null);
  const loadingOptionRef = useRef<View>(null);
  const manageOptionRef = useRef<View>(null);
  const frame = useRef<number | null>(null);
  const modalShown = useRef(false);
  const restorePending = useRef(false);
  const currentDesktopId = 'desktop' in connection ? connection.desktop.desktopId : null;
  const presentation = remoteDevicePresentation(connection);

  const scheduleFocus = useCallback((target: View | null) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      try { focusAccessibilityTarget(target); } catch { /* The target may disappear during navigation. */ }
    });
  }, []);

  useEffect(() => {
    let active = true;
    void manager.listSaved().then((pcs) => { if (active) setSaved(pcs); }).catch(() => { if (active) setSaved([]); });
    return () => { active = false; };
  }, [connection, manager]);
  useEffect(() => {
    if (visible && modalShown.current && saved !== null) scheduleFocus(selectedOptionRef.current ?? firstOptionRef.current ?? manageOptionRef.current);
  }, [saved, scheduleFocus, visible]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  const restoreButtonFocus = () => {
    if (!restorePending.current) return;
    restorePending.current = false;
    scheduleFocus(buttonRef.current);
  };
  const dismiss = () => {
    modalShown.current = false;
    restorePending.current = true;
    setVisible(false);
    if (Platform.OS === 'android') restoreButtonFocus();
  };
  const selectPc = (pc: SavedPc) => {
    if (pc.desktopId === currentDesktopId) { dismiss(); return; }
    AccessibilityInfo.announceForAccessibilityWithOptions(`Connecting to ${pc.displayName}.`, { queue: true });
    dismiss();
    void manager.switchSaved(pc);
  };
  const openManagePcs = () => {
    modalShown.current = false;
    restorePending.current = false;
    setVisible(false);
    managePcs();
  };

  return <>
    <Pressable
      ref={buttonRef}
      accessibilityRole="button"
      accessibilityLabel="Switch PC"
      accessibilityValue={{ text: `${presentation.status}, ${presentation.name}` }}
      accessibilityHint="Opens your saved PCs."
      onPress={() => setVisible(true)}
      style={({ pressed }) => ({ alignItems: 'center', backgroundColor: pressed ? colors.surfacePressed : colors.surfaceRaised, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.sm })}
    >
      <MaterialIcons color={colors.brandText} importantForAccessibility="no" name="computer" size={24} />
      <View style={{ flex: 1, flexShrink: 1 }}>
        <AppText variant="label">{presentation.name}</AppText>
        <AppText muted variant="caption">{presentation.status}</AppText>
      </View>
      <MaterialIcons color={colors.textMuted} importantForAccessibility="no" name="keyboard-arrow-up" size={24} />
    </Pressable>
    <Modal testID="pc-switcher-modal" animationType={reducedMotion || Platform.OS === 'android' ? 'none' : 'fade'} onDismiss={restoreButtonFocus} onRequestClose={dismiss} onShow={() => { modalShown.current = true; scheduleFocus(selectedOptionRef.current ?? firstOptionRef.current ?? (saved === null ? loadingOptionRef.current : manageOptionRef.current)); }} supportedOrientations={['portrait', 'landscape']} transparent visible={visible}>
      <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl }}>
        <Pressable testID="pc-switcher-scrim" accessible={false} importantForAccessibility="no" onPress={dismiss} style={{ backgroundColor: 'rgba(0, 0, 0, 0.58)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }} />
        <View testID="pc-switcher-dialog" accessibilityViewIsModal onAccessibilityEscape={dismiss} style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, gap: spacing.md, maxHeight: '80%', maxWidth: 480, padding: spacing.xl, width: '100%' }}>
          <AppText accessibilityRole="header" variant="heading">Switch PC</AppText>
          {saved === null ? <ActionButton controlRef={loadingOptionRef} label="Loading saved PCs…" busy disabled onPress={() => undefined} /> : saved.length > 0 ? <ScrollView contentContainerStyle={{ gap: spacing.sm }}>
            {saved.map((pc, index) => <ControlButton key={pc.desktopId} {...(pc.desktopId === currentDesktopId ? { controlRef: selectedOptionRef } : index === 0 ? { controlRef: firstOptionRef } : {})} label={pc.displayName} selected={pc.desktopId === currentDesktopId} onPress={() => selectPc(pc)} />)}
          </ScrollView> : <EmptyState icon="computer" title="No saved PCs" body="Pair a PC before using quick switching." />}
          <ActionButton controlRef={manageOptionRef} icon="settings-remote" label="Manage PCs" tone="secondary" onPress={openManagePcs} />
          <ActionButton icon="close" label="Close" tone="tertiary" onPress={dismiss} />
        </View>
      </View>
    </Modal>
  </>;
}
