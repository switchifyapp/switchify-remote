import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { deviceModelRemoteName, resolveRemoteName, validateRemoteName } from '@/device/remoteName';
import { useTheme } from '@/theme/ThemeContext';
import { ActionButton } from './ActionButton';
import { AppText } from './AppText';
import { ResponsiveGrid } from './ResponsiveGrid';

export type RemoteNameSaveResult = 'synced' | 'deferred' | 'failed';

export function RemoteNameEditor({ remoteName, onSave, modelName }: { remoteName: string | null; onSave: (name: string | null) => Promise<RemoteNameSaveResult>; modelName?: string | null }) {
  const automaticName = deviceModelRemoteName(modelName);
  const resolvedName = resolveRemoteName(remoteName, modelName);
  const [draft, setDraft] = useState(resolvedName);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const { colors, radii, spacing, typography } = useTheme();
  const validation = validateRemoteName(draft);

  const commit = async (name: string | null) => {
    setSaving(true);
    setStatus('');
    try {
      const result = await onSave(name);
      setDraft(name ?? automaticName);
      setStatus(result === 'synced'
        ? 'Saved and updated on the connected computer.'
        : result === 'failed'
          ? 'Saved. The computer could not be updated; it will retry next time.'
          : 'Saved. It will update the next time you connect.');
    } catch {
      setStatus('Could not save the Remote name.');
    } finally {
      setSaving(false);
    }
  };

  const unchanged = validation.valid && (remoteName === null ? validation.value === automaticName : validation.value === remoteName);
  const error = draft.length > 0 && !validation.valid ? validation.error : '';

  return <View style={{ gap: spacing.sm }}>
    <TextInput
      accessibilityLabel="Remote name"
      accessibilityHint="The name shown on paired computers"
      autoCapitalize="words"
      editable={!saving}
      maxLength={80}
      onChangeText={(value) => { setDraft(value); setStatus(''); }}
      returnKeyType="done"
      style={[typography.body, { backgroundColor: colors.surfaceRaised, borderColor: error ? colors.danger : colors.border, borderRadius: radii.md, borderWidth: 1, color: colors.text, minHeight: 52, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }]}
      value={draft}
    />
    {error ? <AppText accessibilityLiveRegion="polite" style={{ color: colors.danger }} variant="caption">{error}</AppText> : null}
    <ResponsiveGrid maxColumns={2} minItemWidth={150}>
      <ActionButton label="Save name" busy={saving} disabled={saving || !validation.valid || unchanged} onPress={() => { if (validation.valid) void commit(validation.value); }} />
      <ActionButton label={`Use device model (${automaticName})`} disabled={saving || (remoteName === null && draft === automaticName)} tone="secondary" onPress={() => void commit(null)} />
    </ResponsiveGrid>
    {status ? <AppText accessibilityLiveRegion="polite" muted variant="caption">{status}</AppText> : null}
  </View>;
}
