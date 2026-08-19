import { useMemo, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { ControlButton } from '@/components/ControlButton';
import { StatusBadge } from '@/components/StatusBadge';
import { commandPayloads } from '@/domain/protocol/commands';
import { preferencesStore, type TypingMode } from '@/storage/PreferencesStore';
import { useTheme } from '@/theme/ThemeContext';
import { LiveTypingController } from './LiveTypingController';
import type { RemoteSession } from './RemoteSession';

const keys = ['Backspace', 'Enter', 'Escape', 'Tab', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'];

export function TypingSurface({ session, mode, draft }: { session: RemoteSession; mode: TypingMode; draft: string }) {
  const [liveText, setLiveText] = useState('');
  const [liveFailed, setLiveFailed] = useState(false);
  const liveRevision = useRef(0);
  const live = useMemo(() => new LiveTypingController(session), [session]);
  const { colors, radii, spacing, typography } = useTheme();
  const liveSupported = session.supportsAll('keyboard.textStream.open', 'keyboard.textStream.chunk', 'keyboard.textStream.key', 'keyboard.textStream.close');
  const draftSupported = session.supports('keyboard.typeText');
  const keySupported = mode === 'live' ? liveSupported : session.supports('keyboard.key');
  const reconcileLive = (next: string) => {
    const revision = ++liveRevision.current;
    setLiveFailed(false);
    void live.update(next).then((sent) => { if (revision === liveRevision.current) setLiveFailed(!sent); });
  };
  const changeLive = (next: string) => { setLiveText(next); reconcileLive(next); };
  const sendDraft = async () => {
    if (!draft || !draftSupported) return;
    const [type, payload] = commandPayloads.typeText(draft);
    if (await session.command(type, payload)) await preferencesStore.update({ draft: '' });
  };
  return <View style={{ gap: spacing.md }}>
    <View style={{ flexDirection: 'row', gap: spacing.sm }}><ControlButton label="Type live" disabled={!liveSupported} selected={mode === 'live'} onPress={() => void preferencesStore.update({ typingMode: 'live' })} /><ControlButton label="Write a draft" disabled={!draftSupported} selected={mode === 'draft'} onPress={() => { void session.closeStream(); void preferencesStore.update({ typingMode: 'draft' }); }} /></View>
    <TextInput accessibilityLabel={mode === 'live' ? 'Live text' : 'Draft text'} editable={mode === 'live' ? liveSupported : draftSupported} maxLength={2000} multiline placeholder={mode === 'live' ? 'Type on your PC' : 'Nothing is sent until you choose Send'} placeholderTextColor={colors.textMuted} style={[typography.body, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, color: colors.text, minHeight: 150, padding: spacing.lg, textAlignVertical: 'top' }]} value={mode === 'live' ? liveText : draft} onChangeText={mode === 'live' ? changeLive : (text) => void preferencesStore.update({ draft: text })} />
    {mode === 'live' ? <View style={{ gap: spacing.sm }}><StatusBadge icon={liveFailed ? 'error-outline' : 'check-circle'} label={!liveSupported ? 'Live typing is not supported by this PC.' : liveFailed ? 'Some text has not reached your PC.' : 'Live · sent as you type'} tone={liveFailed ? 'danger' : 'success'} />{liveFailed ? <ControlButton label="Retry unsent text" onPress={() => reconcileLive(liveText)} /> : null}</View> : <View style={{ flexDirection: 'row', gap: spacing.sm }}><ControlButton label="Clear" disabled={!draft} onPress={() => void preferencesStore.update({ draft: '' })} /><ControlButton label="Send to PC" disabled={!draft || !draftSupported} onPress={() => void sendDraft()} /></View>}
    <AppText accessibilityRole="header" variant="heading">PC keys</AppText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{keys.map((key) => <View key={key} style={{ flexBasis: '22%', flexGrow: 1 }}><ControlButton size="key" label={key.replace('Arrow', '')} disabled={!keySupported} onPress={() => { if (mode === 'live') void session.streamKey(key); else { const [type, payload] = commandPayloads.key(key); void session.command(type, payload); } }} /></View>)}</View>
  </View>;
}
