import { useEffect, useMemo, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { ControlButton } from '@/components/ControlButton';
import { ResponsiveGrid } from '@/components/ResponsiveGrid';
import { StatusBadge } from '@/components/StatusBadge';
import { commandPayloads } from '@/domain/protocol/commands';
import { preferencesStore, type TypingMode } from '@/storage/PreferencesStore';
import { useTheme } from '@/theme/ThemeContext';
import { focusLiveTextInput } from './focusLiveTextInput';
import { LiveTypingController } from './LiveTypingController';
import type { RemoteSession } from './RemoteSession';

const keys = ['Backspace', 'Enter', 'Escape', 'Tab', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'];

export function TypingSurface({ session, mode, draft }: { session: RemoteSession; mode: TypingMode; draft: string }) {
  const [liveText, setLiveText] = useState('');
  const [liveFailure, setLiveFailure] = useState<'text' | 'enter' | null>(null);
  const [liveSubmitting, setLiveSubmitting] = useState(false);
  const [liveFocusRequest, setLiveFocusRequest] = useState(0);
  const liveRevision = useRef(0);
  const liveSubmittingRef = useRef(false);
  const liveInputRef = useRef<TextInput>(null);
  const mounted = useRef(true);
  const live = useMemo(() => new LiveTypingController(session), [session]);
  const { colors, radii, spacing, typography } = useTheme();
  const liveSupported = session.supportsAll('keyboard.textStream.open', 'keyboard.textStream.chunk', 'keyboard.textStream.key', 'keyboard.textStream.close');
  const draftSupported = session.supports('keyboard.typeText');
  const keySupported = mode === 'live' ? liveSupported : session.supports('keyboard.key');
  const reconcileLive = (next: string) => {
    const revision = ++liveRevision.current;
    setLiveFailure(null);
    void live.update(next).then((sent) => { if (revision === liveRevision.current) setLiveFailure(sent ? null : 'text'); });
  };
  const changeLive = (next: string) => {
    if (liveSubmittingRef.current) return;
    setLiveText(next);
    reconcileLive(next);
  };
  const submitLive = async () => {
    if (!liveSupported || liveSubmittingRef.current) return;
    liveSubmittingRef.current = true;
    const revision = ++liveRevision.current;
    setLiveFailure(null);
    setLiveSubmitting(true);
    const sent = await live.submitLine();
    if (!mounted.current) return;
    if (revision === liveRevision.current) {
      if (sent) setLiveText('');
      else setLiveFailure('enter');
    }
    liveSubmittingRef.current = false;
    setLiveSubmitting(false);
    setLiveFocusRequest((request) => request + 1);
  };
  useEffect(() => {
    if (liveFocusRequest > 0) focusLiveTextInput(liveInputRef.current);
  }, [liveFocusRequest]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      liveRevision.current += 1;
      liveSubmittingRef.current = false;
    };
  }, []);
  const sendDraft = async () => {
    if (!draft || !draftSupported) return;
    const [type, payload] = commandPayloads.typeText(draft);
    if (await session.command(type, payload)) await preferencesStore.update({ draft: '' });
  };
  return <View style={{ gap: spacing.md }}>
    <View style={{ flexDirection: 'row', gap: spacing.sm }}><ControlButton label="Type live" disabled={!liveSupported} selected={mode === 'live'} onPress={() => void preferencesStore.update({ typingMode: 'live' })} /><ControlButton label="Write a draft" disabled={!draftSupported} selected={mode === 'draft'} onPress={() => { void session.closeStream(); void preferencesStore.update({ typingMode: 'draft' }); }} /></View>
    <TextInput ref={liveInputRef} accessibilityLabel={mode === 'live' ? 'Live text' : 'Draft text'} editable={mode === 'live' ? liveSupported && !liveSubmitting : draftSupported} maxLength={2000} multiline submitBehavior={mode === 'live' ? 'submit' : 'newline'} placeholder={mode === 'live' ? 'Type on your PC' : 'Nothing is sent until you choose Send'} placeholderTextColor={colors.textMuted} style={[typography.body, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, color: colors.text, minHeight: 150, padding: spacing.lg, textAlignVertical: 'top' }]} value={mode === 'live' ? liveText : draft} onChangeText={mode === 'live' ? changeLive : (text) => void preferencesStore.update({ draft: text })} onSubmitEditing={mode === 'live' ? () => void submitLive() : undefined} />
    {mode === 'live' ? <View style={{ gap: spacing.sm }}><StatusBadge icon={liveFailure ? 'error-outline' : 'check-circle'} label={!liveSupported ? 'Live typing is not supported by this PC.' : liveFailure === 'enter' ? 'Enter has not reached your PC.' : liveFailure === 'text' ? 'Some text has not reached your PC.' : liveSubmitting ? 'Sending Enter' : 'Live · sent as you type'} tone={liveFailure ? 'danger' : 'success'} />{liveFailure === 'text' ? <ControlButton label="Retry unsent text" onPress={() => reconcileLive(liveText)} /> : liveFailure === 'enter' ? <ControlButton label="Retry Enter" onPress={() => void submitLive()} /> : null}</View> : <ResponsiveGrid maxColumns={2} minItemWidth={130}><ControlButton label="Clear" disabled={!draft} onPress={() => void preferencesStore.update({ draft: '' })} /><ControlButton label="Send to PC" disabled={!draft || !draftSupported} onPress={() => void sendDraft()} /></ResponsiveGrid>}
    <AppText accessibilityRole="header" variant="heading">PC keys</AppText>
    <ResponsiveGrid maxColumns={4} minItemWidth={80}>{keys.map((key) => <ControlButton key={key} size="key" label={key.replace('Arrow', '')} disabled={!keySupported || (mode === 'live' && liveSubmitting)} onPress={() => { if (mode === 'live') { if (key === 'Enter') void submitLive(); else void session.streamKey(key); } else { const [type, payload] = commandPayloads.key(key); void session.command(type, payload); } }} />)}</ResponsiveGrid>
  </View>;
}
