import { View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ControlButton } from '@/components/ControlButton';
import { ResponsiveGrid } from '@/components/ResponsiveGrid';
import { StatusBadge } from '@/components/StatusBadge';
import { useAccessibilityAnnouncement } from '@/components/useAccessibilityAnnouncement';
import { commandPayloads } from '@/domain/protocol/commands';
import { useLayout, useTheme } from '@/theme/ThemeContext';
import type { RemoteSession, RemoteSessionState } from './RemoteSession';

const directions = [
  ['↖', 'Move up and left', -1, -1], ['↑', 'Move up', 0, -1], ['↗', 'Move up and right', 1, -1],
  ['←', 'Move left', -1, 0], ['Click', 'Left click', 0, 0], ['→', 'Move right', 1, 0],
  ['↙', 'Move down and left', -1, 1], ['↓', 'Move down', 0, 1], ['↘', 'Move down and right', 1, 1],
] as const;
const scrollStep = 5;

export function MouseSurface({ session, state, physicalSwitchStopAvailable = true }: { session: RemoteSession; state: RemoteSessionState; physicalSwitchStopAvailable?: boolean }) {
  const profile = session.profile;
  const step = Math.max(1, Math.min(profile?.maxDelta ?? 128, profile?.capabilities.pointerSpeed.baseMoveDelta ?? profile?.recommendedDeltas.medium ?? 128));
  const speed = profile?.capabilities.pointerSpeed;
  const display = profile?.capabilities.displayNavigation;
  const click = commandPayloads.click();
  const sendTuple = (tuple: readonly [string, Record<string, string | number>]) => void session.command(tuple[0], tuple[1]);
  const { isExpanded, isLandscape, isLargeText, isMedium } = useLayout();
  const { spacing } = useTheme();
  const twoPane = (isExpanded || (isMedium && isLandscape)) && !isLargeText;
  useAccessibilityAnnouncement(state.repeat ? 'Pointer movement is repeating.' : null);

  const movement = <View style={{ flex: 1, gap: spacing.md, maxWidth: 400, minWidth: twoPane ? 320 : undefined, width: '100%' }}>
    <AppText accessibilityRole="header" variant="heading">Movement</AppText>
    <ResponsiveGrid exactColumns={3} gap={10} minItemWidth={48}>{directions.map(([label, accessibleLabel, dx, dy]) => <ControlButton key={label} emphasized={dx === 0 && dy === 0} label={label} accessibilityLabel={accessibleLabel} size="key" disabled={!session.supports(dx === 0 && dy === 0 ? 'mouse.click' : 'mouse.move')} onPress={() => dx === 0 && dy === 0 ? sendTuple(click) : void session.mouse('mouse.move', { dx: dx * step, dy: dy * step }, true)} />)}</ResponsiveGrid>
    {state.repeat ? <ActionButton icon="stop-circle" label="Stop movement" tone="danger" onPress={() => void session.stopRepeat()} /> : null}
  </View>;

  const secondary = <View style={{ flex: 1, gap: spacing.md, minWidth: twoPane ? 300 : undefined }}>
    <AppText accessibilityRole="header" variant="heading">Clicks and scroll</AppText>
    <ResponsiveGrid minItemWidth={150}><ControlButton icon="ads-click" label="Double click" disabled={!session.supports('mouse.doubleClick')} onPress={() => sendTuple(commandPayloads.doubleClick())} /><ControlButton icon="mouse" label="Right click" disabled={!session.supports('mouse.rightClick')} onPress={() => sendTuple(commandPayloads.rightClick())} /><ControlButton icon="pan-tool" label={state.dragging ? 'End drag' : 'Start drag'} disabled={!session.supports(state.dragging ? 'mouse.dragEnd' : 'mouse.dragStart')} selected={state.dragging} onPress={() => void session.toggleDrag()} /></ResponsiveGrid>
    <ResponsiveGrid maxColumns={2} minItemWidth={140}><ControlButton icon="arrow-upward" label="Scroll up" disabled={!session.supports('mouse.scroll')} onPress={() => void session.mouse('mouse.scroll', { dx: 0, dy: scrollStep }, true)} /><ControlButton icon="arrow-downward" label="Scroll down" disabled={!session.supports('mouse.scroll')} onPress={() => void session.mouse('mouse.scroll', { dx: 0, dy: -scrollStep }, true)} /></ResponsiveGrid>
    {speed?.supported ? <View style={{ gap: spacing.sm }}><AppText accessibilityRole="header" variant="heading">Pointer speed · {speed.scalePercent}%</AppText><ResponsiveGrid maxColumns={2} minItemWidth={120}><ControlButton icon="remove" label="Slower" disabled={!session.supports('pointer.speed.set') || !speed.setSupported || speed.scalePercent <= speed.minScalePercent} onPress={() => sendTuple(commandPayloads.pointerSpeed(Math.max(speed.minScalePercent, speed.scalePercent - speed.stepPercent)))} /><ControlButton icon="add" label="Faster" disabled={!session.supports('pointer.speed.set') || !speed.setSupported || speed.scalePercent >= speed.maxScalePercent} onPress={() => sendTuple(commandPayloads.pointerSpeed(Math.min(speed.maxScalePercent, speed.scalePercent + speed.stepPercent)))} /></ResponsiveGrid></View> : null}
    {display?.supported && display.displayCount > 1 ? <View style={{ gap: spacing.sm }}><AppText accessibilityRole="header" variant="heading">Move to monitor</AppText><ResponsiveGrid maxColumns={4} minItemWidth={96}>{(['left', 'up', 'down', 'right'] as const).map((direction) => <ControlButton key={direction} label={direction[0]!.toUpperCase() + direction.slice(1)} disabled={!session.supports('pointer.display.move')} onPress={() => sendTuple(commandPayloads.displayMove(direction))} />)}</ResponsiveGrid></View> : null}
  </View>;

  return <View style={{ gap: spacing.md }}>
    {state.repeat ? <StatusBadge icon="autorenew" label="Movement is repeating. Use Stop movement or another control to stop." tone="warning" /> : null}
    {!physicalSwitchStopAvailable && profile?.capabilities.mouseRepeat.supported && profile.capabilities.mouseRepeat.enabled ? <Card><AppText muted>Switchify is unavailable. Use a Remote control to stop movement repeat.</AppText></Card> : null}
    <View style={{ alignItems: 'flex-start', flexDirection: twoPane ? 'row' : 'column', gap: spacing.xl }}>{movement}{secondary}</View>
  </View>;
}
