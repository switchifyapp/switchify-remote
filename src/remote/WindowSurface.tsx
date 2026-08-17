import { StyleSheet, Text, View } from 'react-native';
import { ControlButton } from '@/components/ControlButton';
import { colors } from '@/constants/colors';
import { commandPayloads } from '@/domain/protocol/commands';
import type { PcPlatform } from '@/domain/protocol/types';
import type { RemoteSession, RemoteSessionState } from './RemoteSession';

const actions = [['Next app', 'switchNext'], ['Previous app', 'switchPrevious'], ['Task view', 'taskView'], ['Show desktop', 'showDesktop'], ['Minimize', 'minimizeFocused'], ['Maximize', 'maximizeFocused'], ['Close', 'closeFocused']] as const;

export function WindowSurface({ session, state, platform }: { session: RemoteSession; state: RemoteSessionState; platform: PcPlatform }) {
  const labels: Record<string, string> = platform === 'macos' ? { Ctrl: 'Control', Alt: 'Option', Shift: 'Shift', Meta: 'Command' } : { Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Start' };
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>Modifiers</Text>
      <View style={styles.row}>{Object.entries(labels).map(([key, label]) => <ControlButton key={key} label={label} disabled={!session.supports(state.modifiers.includes(key) ? 'keyboard.modifierUp' : 'keyboard.modifierDown')} selected={state.modifiers.includes(key)} onPress={() => void session.toggleModifier(key)} />)}</View>
      <Text style={styles.help}>Held modifiers stay active until selected again, used in a shortcut, or the remote disconnects.</Text>
      <Text accessibilityRole="header" style={styles.heading}>Windows</Text>
      <View style={styles.grid}>{actions.map(([label, action]) => <View key={action} style={styles.cell}><ControlButton label={label} danger={action === 'closeFocused'} disabled={!session.supports('window.control')} onPress={() => { const [type, payload] = commandPayloads.windowControl(action); void session.command(type, payload); }} /></View>)}</View>
      <Text accessibilityRole="header" style={styles.heading}>Shortcuts</Text>
      <View style={styles.row}>{['A', 'C', 'V', 'X'].map((key) => <ControlButton key={key} label={`${state.modifiers.length ? state.modifiers.map((item) => labels[item]).join('+') + '+' : ''}${key}`} disabled={!session.supports('keyboard.shortcut')} onPress={() => void session.shortcut(key)} />)}</View>
      {session.profile?.capabilities.displayNavigation.supported && session.profile.capabilities.displayNavigation.displayCount > 1 ? <><Text accessibilityRole="header" style={styles.heading}>Move pointer to monitor</Text><View style={styles.row}>{(['left', 'up', 'down', 'right'] as const).map((direction) => <ControlButton key={direction} label={direction[0]!.toUpperCase() + direction.slice(1)} disabled={!session.supports('pointer.display.move')} onPress={() => { const [type, payload] = commandPayloads.displayMove(direction); void session.command(type, payload); }} />)}</View></> : null}
    </View>
  );
}

const styles = StyleSheet.create({ section: { gap: 12 }, heading: { color: colors.text, fontSize: 20, fontWeight: '800' }, help: { color: colors.textMuted, fontSize: 15, lineHeight: 22 }, row: { flexDirection: 'row', gap: 8 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, cell: { flexBasis: '30%', flexGrow: 1 } });
