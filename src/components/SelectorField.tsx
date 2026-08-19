import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Modal, Platform, Pressable, ScrollView, View } from 'react-native';

import { ActionButton } from './ActionButton';
import { AppText } from './AppText';
import { ControlButton } from './ControlButton';
import { focusAccessibilityTarget } from './accessibilityFocus';
import { useTheme } from '@/theme/ThemeContext';

export type SelectorOption<T extends string | number> = { key: T; label: string; disabled?: boolean };

export function SelectorField<T extends string | number>({ label, options, selectedKey, onSelect, hint = 'Opens a list of options.', modalTitle = label }: {
  label: string;
  options: readonly SelectorOption<T>[];
  selectedKey: T;
  onSelect: (key: T) => void | Promise<void>;
  hint?: string;
  modalTitle?: string;
}) {
  const { colors, radii, reducedMotion, spacing } = useTheme();
  const [visible, setVisible] = useState(false);
  const [displayedKey, setDisplayedKey] = useState(selectedKey);
  const [previousSelectedKey, setPreviousSelectedKey] = useState(selectedKey);
  const [selecting, setSelecting] = useState(false);
  const fieldRef = useRef<View>(null);
  const selectedOptionRef = useRef<View>(null);
  const mounted = useRef(true);
  const restorePending = useRef(false);
  const frame = useRef<number | null>(null);
  if (previousSelectedKey !== selectedKey) {
    setPreviousSelectedKey(selectedKey);
    setDisplayedKey(selectedKey);
  }
  const selected = options.find((option) => option.key === displayedKey) ?? options[0];

  useEffect(() => () => {
    mounted.current = false;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const scheduleFocus = (ref: typeof fieldRef | typeof selectedOptionRef) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (!mounted.current) return;
      try {
        focusAccessibilityTarget(ref.current);
      } catch {
        // A native target may disappear while the modal is transitioning.
      }
    });
  };
  const restoreFieldFocus = () => {
    if (!restorePending.current) return;
    restorePending.current = false;
    scheduleFocus(fieldRef);
  };
  const close = () => {
    restorePending.current = true;
    setVisible(false);
    if (Platform.OS === 'android') restoreFieldFocus();
  };
  const choose = async (option: SelectorOption<T>) => {
    if (selecting) return;
    setSelecting(true);
    try {
      await onSelect(option.key);
      if (!mounted.current) return;
      setDisplayedKey(option.key);
      AccessibilityInfo.announceForAccessibilityWithOptions(`${label}: ${option.label}`, { queue: true });
      close();
    } catch {
      // Keep the selector open and do not announce a value that was not saved.
    } finally {
      if (mounted.current) setSelecting(false);
    }
  };

  return <>
    <Pressable ref={fieldRef} accessibilityRole="button" accessibilityLabel={label} accessibilityValue={{ text: selected?.label ?? '' }} accessibilityHint={hint} onPress={() => setVisible(true)} style={({ pressed }) => ({ alignItems: 'center', backgroundColor: pressed ? colors.surfacePressed : colors.surfaceRaised, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 48, padding: spacing.md })}>
      <AppText style={{ flex: 1, flexShrink: 1 }} variant="label">{label}: {selected?.label ?? ''}</AppText>
      <MaterialIcons color={colors.textMuted} importantForAccessibility="no" name="unfold-more" size={20} />
    </Pressable>
    <Modal testID="selector-modal" animationType={reducedMotion || Platform.OS === 'android' ? 'none' : 'fade'} onDismiss={restoreFieldFocus} onRequestClose={close} onShow={() => scheduleFocus(selectedOptionRef)} supportedOrientations={['portrait', 'landscape']} transparent visible={visible}>
      <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl }}>
        <Pressable testID="selector-scrim" accessible={false} importantForAccessibility="no" onPress={close} style={{ backgroundColor: 'rgba(0, 0, 0, 0.58)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }} />
        <View testID="selector-dialog" accessibilityViewIsModal onAccessibilityEscape={close} style={{ backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, gap: spacing.md, maxHeight: '80%', maxWidth: 480, padding: spacing.xl, width: '100%' }}>
          <AppText accessibilityRole="header" variant="heading">{modalTitle}</AppText>
          <ScrollView contentContainerStyle={{ gap: spacing.sm }}>
            {options.map((option) => <ControlButton key={String(option.key)} {...(option.key === displayedKey ? { controlRef: selectedOptionRef } : {})} label={option.label} selected={option.key === displayedKey} disabled={selecting || (option.disabled ?? false)} onPress={() => void choose(option)} />)}
          </ScrollView>
          <ActionButton icon="close" label="Close" tone="secondary" onPress={close} />
        </View>
      </View>
    </Modal>
  </>;
}
