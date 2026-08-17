import { StyleSheet, Text, View } from 'react-native';
import { ControlButton } from '@/components/ControlButton';
import { useAccessibilityAnnouncement } from '@/components/useAccessibilityAnnouncement';
import { colors } from '@/constants/colors';
import { commandPayloads } from '@/domain/protocol/commands';
import type { RemoteSession, RemoteSessionState } from './RemoteSession';

const directions = [
  ['↖', 'Move up and left', -1, -1], ['↑', 'Move up', 0, -1], ['↗', 'Move up and right', 1, -1],
  ['←', 'Move left', -1, 0], ['Click', 'Left click', 0, 0], ['→', 'Move right', 1, 0],
  ['↙', 'Move down and left', -1, 1], ['↓', 'Move down', 0, 1], ['↘', 'Move down and right', 1, 1],
] as const;

export function MouseSurface({ session, state, physicalSwitchStopAvailable = true }: { session: RemoteSession; state: RemoteSessionState; physicalSwitchStopAvailable?: boolean }) {
  const profile = session.profile;
  const step = Math.max(1, Math.min(profile?.maxDelta ?? 128, profile?.capabilities.pointerSpeed.baseMoveDelta ?? profile?.recommendedDeltas.medium ?? 128));
  const speed = profile?.capabilities.pointerSpeed;
  const display = profile?.capabilities.displayNavigation;
  const click = commandPayloads.click();
  const sendTuple = (tuple: readonly [string, Record<string, string | number>]) => void session.command(tuple[0], tuple[1]);
  useAccessibilityAnnouncement(state.repeat ? 'Pointer movement is repeating.' : null);
  return (
    <View style={styles.section}>
      {state.repeat ? <Text accessibilityLiveRegion="polite" style={styles.status}>Movement is repeating. Tap any control to stop.</Text> : null}
      {!physicalSwitchStopAvailable && profile?.capabilities.mouseRepeat.supported && profile.capabilities.mouseRepeat.enabled ? <Text accessibilityLiveRegion="polite" style={styles.warning}>Switchify is unavailable. Use a Remote control to stop movement repeat.</Text> : null}
      <Text accessibilityRole="header" style={styles.heading}>Movement</Text>
      <View style={styles.grid}>{directions.map(([label, accessibleLabel, dx, dy]) => <View key={label} style={styles.cell}><ControlButton label={label} accessibilityLabel={accessibleLabel} disabled={!session.supports(dx === 0 && dy === 0 ? 'mouse.click' : 'mouse.move')} onPress={() => dx === 0 && dy === 0 ? sendTuple(click) : void session.mouse('mouse.move', { dx: dx * step, dy: dy * step }, true)} /></View>)}</View>
      <Text accessibilityRole="header" style={styles.heading}>Clicks and scroll</Text>
      <View style={styles.row}><ControlButton label="Double click" disabled={!session.supports('mouse.doubleClick')} onPress={() => sendTuple(commandPayloads.doubleClick())} /><ControlButton label="Right click" disabled={!session.supports('mouse.rightClick')} onPress={() => sendTuple(commandPayloads.rightClick())} /><ControlButton label={state.dragging ? 'End drag' : 'Start drag'} disabled={!session.supports(state.dragging ? 'mouse.dragEnd' : 'mouse.dragStart')} selected={state.dragging} onPress={() => void session.toggleDrag()} /></View>
      <View style={styles.row}><ControlButton label="Scroll up" disabled={!session.supports('mouse.scroll')} onPress={() => void session.mouse('mouse.scroll', { dx: 0, dy: step }, true)} /><ControlButton label="Scroll down" disabled={!session.supports('mouse.scroll')} onPress={() => void session.mouse('mouse.scroll', { dx: 0, dy: -step }, true)} /></View>
      {speed?.supported ? <><Text accessibilityRole="header" style={styles.heading}>Pointer speed · {speed.scalePercent}%</Text><View style={styles.row}><ControlButton label="Slower" disabled={!session.supports('pointer.speed.set') || !speed.setSupported || speed.scalePercent <= speed.minScalePercent} onPress={() => sendTuple(commandPayloads.pointerSpeed(Math.max(speed.minScalePercent, speed.scalePercent - speed.stepPercent)))} /><ControlButton label="Faster" disabled={!session.supports('pointer.speed.set') || !speed.setSupported || speed.scalePercent >= speed.maxScalePercent} onPress={() => sendTuple(commandPayloads.pointerSpeed(Math.min(speed.maxScalePercent, speed.scalePercent + speed.stepPercent)))} /></View></> : null}
      {display?.supported && display.displayCount > 1 ? <><Text accessibilityRole="header" style={styles.heading}>Move to monitor</Text><View style={styles.row}>{(['left', 'up', 'down', 'right'] as const).map((direction) => <ControlButton key={direction} label={direction[0]!.toUpperCase() + direction.slice(1)} disabled={!session.supports('pointer.display.move')} onPress={() => sendTuple(commandPayloads.displayMove(direction))} />)}</View></> : null}
    </View>
  );
}

const styles = StyleSheet.create({ section: { gap: 12 }, heading: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 4 }, status: { color: colors.warning, fontSize: 16 }, warning: { color: colors.textMuted, fontSize: 16 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, cell: { flexBasis: '30%', flexGrow: 1 }, row: { flexDirection: 'row', gap: 8 } });
