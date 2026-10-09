import { ACTION_LABELS, validateSwitchSettings, type ScanAction, type SwitchBinding } from '@switchify/scanning';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { AppText } from '@/components/AppText';
import { ControlButton } from '@/components/ControlButton';
import { SelectorField } from '@/components/SelectorField';
import { preferencesStore } from '@/storage/PreferencesStore';
import { usePreferences } from '@/storage/usePreferences';
import { useTheme } from '@/theme/ThemeContext';
import { captureNextKey } from './keyCapture';
import { keyLabel, SCAN_SPEEDS_MS, type ScanningPreferences } from './preferences';

const PRESS_ACTIONS: ScanAction[] = ['select', 'next', 'back', 'pause', 'reverse', 'stop'];
const HOLD_CHOICES: { key: string; label: string; actions: ScanAction[] }[] = [
  { key: 'none', label: 'Nothing', actions: [] },
  { key: 'reverse', label: 'Reverse direction', actions: ['reverse'] },
  { key: 'pause', label: 'Pause / resume', actions: ['pause'] },
  { key: 'stop', label: 'Stop scanning', actions: ['stop'] },
  { key: 'reverse-stop', label: 'Reverse, then stop', actions: ['reverse', 'stop'] },
];

function holdKey(actions: ScanAction[]): string {
  return HOLD_CHOICES.find((choice) => choice.actions.join() === actions.join())?.key ?? 'none';
}

/** Switch scanning settings: off by default, then movement, speed, pattern and switches. */
export function ScanningSettings() {
  const { scanning } = usePreferences();
  const { colors, spacing } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [capturingId, setCapturingId] = useState<string | null>(null);
  const stopCapture = useRef<(() => void) | null>(null);
  useEffect(() => () => stopCapture.current?.(), []);

  const save = async (next: ScanningPreferences): Promise<boolean> => {
    const problem = validateSwitchSettings(next.switches, next.automatic);
    if (problem) { setError(problem); return false; }
    setError(null);
    await preferencesStore.update({ scanning: next });
    return true;
  };
  const updateBinding = (id: string, patch: Partial<SwitchBinding>) => save({ ...scanning, switches: { ...scanning.switches, bindings: scanning.switches.bindings.map((binding) => binding.id === id ? { ...binding, ...patch } : binding) } });
  const assignKey = (binding: SwitchBinding) => {
    stopCapture.current?.();
    setCapturingId(binding.id);
    stopCapture.current = captureNextKey((code) => {
      stopCapture.current = null;
      setCapturingId(null);
      if (code) void updateBinding(binding.id, { key: code });
    });
  };
  const addSwitch = () => {
    stopCapture.current?.();
    setCapturingId("new");
    stopCapture.current = captureNextKey((code) => {
      stopCapture.current = null;
      setCapturingId(null);
      if (!code) return;
      const used = new Set(scanning.switches.bindings.map((binding) => binding.pressAction));
      const action = PRESS_ACTIONS.find((candidate) => !used.has(candidate)) ?? "next";
      const binding: SwitchBinding = { id: `switch-${Date.now()}`, name: ACTION_LABELS[action], key: code, pressAction: action, holdActions: [] };
      void save({ ...scanning, switches: { ...scanning.switches, bindings: [...scanning.switches.bindings, binding] } });
    });
  };

  return <View style={{ gap: spacing.md }}>
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <ControlButton label="Off" selected={!scanning.enabled} onPress={() => void save({ ...scanning, enabled: false })} />
      <ControlButton label="On" selected={scanning.enabled} onPress={() => void save({ ...scanning, enabled: true })} />
    </View>
    {scanning.enabled ? <>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <ControlButton label="Automatic" selected={scanning.automatic} onPress={() => void save({ ...scanning, automatic: true })} />
        <ControlButton label="Manual" selected={!scanning.automatic} onPress={() => void save({ ...scanning, automatic: false })} />
      </View>
      {scanning.automatic ? <SelectorField label="Scan speed" options={SCAN_SPEEDS_MS.map((ms) => ({ key: ms, label: `${ms / 1000} seconds` }))} selectedKey={scanning.intervalMs} onSelect={(intervalMs) => save({ ...scanning, intervalMs }).then(() => undefined)} /> : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <ControlButton label="Sections first" selected={scanning.pattern === 'grouped'} onPress={() => void save({ ...scanning, pattern: 'grouped' })} />
        <ControlButton label="Every control" selected={scanning.pattern === 'linear'} onPress={() => void save({ ...scanning, pattern: 'linear' })} />
      </View>
      <AppText variant="label">Switches</AppText>
      {scanning.switches.bindings.map((binding) => <View key={binding.id} style={{ borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: spacing.sm, padding: spacing.md }}>
        <AppText variant="label">{binding.key ? `Key: ${keyLabel(binding.key)}` : 'No key set'}</AppText>
        <ActionButton icon="keyboard" label={capturingId === binding.id ? 'Press your switch now…' : 'Set key'} tone="secondary" busy={capturingId === binding.id} onPress={() => assignKey(binding)} />
        <SelectorField label="Press" options={PRESS_ACTIONS.map((action) => ({ key: action, label: ACTION_LABELS[action] }))} selectedKey={binding.pressAction} onSelect={(pressAction) => updateBinding(binding.id, { pressAction, name: ACTION_LABELS[pressAction] }).then(() => undefined)} />
        <SelectorField label="Hold" options={HOLD_CHOICES.map(({ key, label }) => ({ key, label }))} selectedKey={holdKey(binding.holdActions)} onSelect={(key) => updateBinding(binding.id, { holdActions: HOLD_CHOICES.find((choice) => choice.key === key)?.actions ?? [] }).then(() => undefined)} />
        {scanning.switches.bindings.length > 1 ? <ActionButton icon="delete-outline" label="Remove switch" tone="tertiary" onPress={() => void save({ ...scanning, switches: { ...scanning.switches, bindings: scanning.switches.bindings.filter((item) => item.id !== binding.id) } })} /> : null}
      </View>)}
      {scanning.switches.bindings.length < 6 ? <ActionButton icon="add" label={capturingId === "new" ? "Press the new switch now…" : "Add switch"} tone="secondary" busy={capturingId === "new"} onPress={addSwitch} /> : null}
      <AppText muted variant="caption">Press Select to start scanning. Escape stops it. Keys still type in text fields while one is in use.</AppText>
    </> : null}
    {error ? <AppText accessibilityLiveRegion="polite" style={{ color: colors.danger }} variant="caption">{error}</AppText> : null}
  </View>;
}
