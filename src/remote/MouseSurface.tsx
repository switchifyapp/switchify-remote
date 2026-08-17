import { StyleSheet, Text, View } from 'react-native';
import { ControlButton } from '@/components/ControlButton';
import { colors } from '@/constants/colors';
import { commandPayloads } from '@/domain/protocol/commands';
import type { RemoteSession, RemoteSessionState } from './RemoteSession';

const directions = [
  ['↖', -1, -1], ['↑', 0, -1], ['↗', 1, -1],
  ['←', -1, 0], ['Click', 0, 0], ['→', 1, 0],
  ['↙', -1, 1], ['↓', 0, 1], ['↘', 1, 1],
] as const;

export function MouseSurface({ session, state }: { session: RemoteSession; state: RemoteSessionState }) {
  const profile = session.profile;
  const step = Math.max(1, Math.min(profile?.maxDelta ?? 128, profile?.capabilities.pointerSpeed.baseMoveDelta ?? profile?.recommendedDeltas.medium ?? 128));
  const speed = profile?.capabilities.pointerSpeed;
  const display = profile?.capabilities.displayNavigation;
  const click = commandPayloads.click();
  const sendTuple = (tuple: readonly [string, Record<string, string | number>]) => void session.command(tuple[0], tuple[1]);
  return (
    <View style={styles.section}>
      {state.repeat ? <Text accessibilityLiveRegion="polite" style={styles.status}>Movement is repeating. Tap any control to stop.</Text> : null}
      <Text accessibilityRole="header" style={styles.heading}>Movement</Text>
      <View style={styles.grid}>{directions.map(([label, dx, dy]) => <View key={label} style={styles.cell}><ControlButton label={label} hint={label === 'Click' ? 'Left click' : `Move pointer ${label}`} onPress={() => dx === 0 && dy === 0 ? sendTuple(click) : void session.mouse('mouse.move', { dx: dx * step, dy: dy * step }, true)} /></View>)}</View>
      <Text accessibilityRole="header" style={styles.heading}>Clicks and scroll</Text>
      <View style={styles.row}><ControlButton label="Double click" onPress={() => sendTuple(commandPayloads.doubleClick())} /><ControlButton label="Right click" onPress={() => sendTuple(commandPayloads.rightClick())} /><ControlButton label={state.dragging ? 'End drag' : 'Start drag'} selected={state.dragging} onPress={() => void session.toggleDrag()} /></View>
      <View style={styles.row}><ControlButton label="Scroll up" onPress={() => void session.mouse('mouse.scroll', { dx: 0, dy: step }, true)} /><ControlButton label="Scroll down" onPress={() => void session.mouse('mouse.scroll', { dx: 0, dy: -step }, true)} /></View>
      {speed?.supported ? <><Text accessibilityRole="header" style={styles.heading}>Pointer speed · {speed.scalePercent}%</Text><View style={styles.row}><ControlButton label="Slower" disabled={!speed.setSupported || speed.scalePercent <= speed.minScalePercent} onPress={() => sendTuple(commandPayloads.pointerSpeed(Math.max(speed.minScalePercent, speed.scalePercent - speed.stepPercent)))} /><ControlButton label="Faster" disabled={!speed.setSupported || speed.scalePercent >= speed.maxScalePercent} onPress={() => sendTuple(commandPayloads.pointerSpeed(Math.min(speed.maxScalePercent, speed.scalePercent + speed.stepPercent)))} /></View></> : null}
      {display?.supported && display.displayCount > 1 ? <><Text accessibilityRole="header" style={styles.heading}>Move to monitor</Text><View style={styles.row}><ControlButton label="Left" onPress={() => sendTuple(commandPayloads.displayMove('left'))} /><ControlButton label="Up" onPress={() => sendTuple(commandPayloads.displayMove('up'))} /><ControlButton label="Down" onPress={() => sendTuple(commandPayloads.displayMove('down'))} /><ControlButton label="Right" onPress={() => sendTuple(commandPayloads.displayMove('right'))} /></View></> : null}
    </View>
  );
}

const styles = StyleSheet.create({ section: { gap: 12 }, heading: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 4 }, status: { color: colors.warning, fontSize: 16 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, cell: { flexBasis: '30%', flexGrow: 1 }, row: { flexDirection: 'row', gap: 8 } });
