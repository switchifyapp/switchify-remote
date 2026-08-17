import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { ControlButton } from '@/components/ControlButton';
import { colors } from '@/constants/colors';
import { commandPayloads } from '@/domain/protocol/commands';
import { preferencesStore, type TypingMode } from '@/storage/PreferencesStore';
import type { RemoteSession } from './RemoteSession';

const keys = ['Backspace', 'Enter', 'Escape', 'Tab', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'];

export function TypingSurface({ session, mode, draft }: { session: RemoteSession; mode: TypingMode; draft: string }) {
  const [liveText, setLiveText] = useState('');
  const previous = useRef('');
  const changeLive = async (next: string) => {
    const old = previous.current;
    let prefix = 0;
    while (prefix < old.length && prefix < next.length && old[prefix] === next[prefix]) prefix += 1;
    for (let count = old.length - prefix; count > 0; count -= 1) if (!await session.streamKey('Backspace')) return;
    const inserted = next.slice(prefix);
    if (inserted && !await session.streamChunk(inserted)) return;
    previous.current = next;
    setLiveText(next);
  };
  const sendDraft = async () => {
    if (!draft) return;
    const [type, payload] = commandPayloads.typeText(draft);
    if (await session.command(type, payload)) await preferencesStore.update({ draft: '' });
  };
  return (
    <View style={styles.section}>
      <View style={styles.row}><ControlButton label="Type live" selected={mode === 'live'} onPress={() => void preferencesStore.update({ typingMode: 'live' })} /><ControlButton label="Write a draft" selected={mode === 'draft'} onPress={() => { void session.closeStream(); void preferencesStore.update({ typingMode: 'draft' }); }} /></View>
      <TextInput accessibilityLabel={mode === 'live' ? 'Live text' : 'Draft text'} maxLength={2000} multiline placeholder={mode === 'live' ? 'Type on your PC' : 'Nothing is sent until you choose Send'} placeholderTextColor={colors.textMuted} style={styles.input} value={mode === 'live' ? liveText : draft} onChangeText={mode === 'live' ? (text) => void changeLive(text) : (text) => void preferencesStore.update({ draft: text })} />
      {mode === 'live' ? <Text style={styles.help}>Live · sent as you type</Text> : <View style={styles.row}><ControlButton label="Clear" disabled={!draft} onPress={() => void preferencesStore.update({ draft: '' })} /><ControlButton label="Send to PC" disabled={!draft} onPress={() => void sendDraft()} /></View>}
      <Text accessibilityRole="header" style={styles.heading}>PC keys</Text>
      <View style={styles.keyGrid}>{keys.map((key) => <View key={key} style={styles.key}><ControlButton label={key.replace('Arrow', '')} onPress={() => { const [type, payload] = commandPayloads.key(key); void session.command(type, payload); }} /></View>)}</View>
    </View>
  );
}

const styles = StyleSheet.create({ section: { gap: 12 }, row: { flexDirection: 'row', gap: 8 }, input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, color: colors.text, fontSize: 18, minHeight: 150, padding: 16, textAlignVertical: 'top' }, help: { color: colors.success, fontSize: 15 }, heading: { color: colors.text, fontSize: 20, fontWeight: '800' }, keyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, key: { flexBasis: '22%', flexGrow: 1 } });
