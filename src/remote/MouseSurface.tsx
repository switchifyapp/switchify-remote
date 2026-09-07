import { type ReactElement } from 'react';
import { SurfaceLayout, type LayoutControl } from '@/layouts/SurfaceLayout';
import { Platform, View } from 'react-native';

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

  const controls: LayoutControl[] = [];
  const register = (id: string, element: ReactElement<LayoutControl>) => { controls.push({ ...element.props, id }); return element; };
  const movement = <View style={{ flex: 1, gap: spacing.md, maxWidth: 400, minWidth: twoPane ? 320 : undefined, width: '100%' }}>
    <AppText accessibilityRole="header" variant="heading">Movement</AppText>
    <ResponsiveGrid exactColumns={3} gap={10} minItemWidth={48}>{directions.map(([label, accessibleLabel, dx, dy]) => register(`move.${dx + 1}.${dy + 1}`, <ControlButton key={label} emphasized={dx === 0 && dy === 0} label={label} accessibilityLabel={accessibleLabel} size="key" disabled={!session.supports(dx === 0 && dy === 0 ? 'mouse.click' : 'mouse.move')} onPress={() => dx === 0 && dy === 0 ? sendTuple(click) : void session.mouse('mouse.move', { dx: dx * step, dy: dy * step }, true)} />))}</ResponsiveGrid>
  </View>;

  const secondary = <View testID="mouse-secondary" style={{ flex: 1, gap: spacing.md, minWidth: twoPane ? 300 : undefined, width: twoPane ? undefined : '100%' }}>
    <AppText accessibilityRole="header" variant="heading">Clicks and scroll</AppText>
    <ResponsiveGrid minItemWidth={140}>{register('click.double', <ControlButton icon="ads-click" label="Double click" disabled={!session.supports('mouse.doubleClick')} onPress={() => sendTuple(commandPayloads.doubleClick())} />)}{register('click.right', <ControlButton icon="mouse" label="Right click" disabled={!session.supports('mouse.rightClick')} onPress={() => sendTuple(commandPayloads.rightClick())} />)}{register('drag.toggle', <ControlButton icon="pan-tool" label={state.dragging ? 'End drag' : 'Start drag'} disabled={!session.supports(state.dragging ? 'mouse.dragEnd' : 'mouse.dragStart')} selected={state.dragging} onPress={() => void session.toggleDrag()} />)}</ResponsiveGrid>
    <ResponsiveGrid maxColumns={2} minItemWidth={140}>{register('scroll.up', <ControlButton icon="arrow-upward" label="Scroll up" disabled={!session.supports('mouse.scroll')} onPress={() => void session.mouse('mouse.scroll', { dx: 0, dy: scrollStep }, true)} />)}{register('scroll.down', <ControlButton icon="arrow-downward" label="Scroll down" disabled={!session.supports('mouse.scroll')} onPress={() => void session.mouse('mouse.scroll', { dx: 0, dy: -scrollStep }, true)} />)}</ResponsiveGrid>
    {speed?.supported ? <View style={{ gap: spacing.sm }}><AppText accessibilityRole="header" variant="heading">Pointer speed · {speed.scalePercent}%</AppText><ResponsiveGrid maxColumns={2} minItemWidth={120}>{register('speed.slower', <ControlButton icon="remove" label="Slower" disabled={!session.supports('pointer.speed.set') || !speed.setSupported || speed.scalePercent <= speed.minScalePercent} onPress={() => sendTuple(commandPayloads.pointerSpeed(Math.max(speed.minScalePercent, speed.scalePercent - speed.stepPercent)))} />)}{register('speed.faster', <ControlButton icon="add" label="Faster" disabled={!session.supports('pointer.speed.set') || !speed.setSupported || speed.scalePercent >= speed.maxScalePercent} onPress={() => sendTuple(commandPayloads.pointerSpeed(Math.min(speed.maxScalePercent, speed.scalePercent + speed.stepPercent)))} />)}</ResponsiveGrid></View> : null}
    {display?.supported && display.displayCount > 1 ? <View style={{ gap: spacing.sm }}><AppText accessibilityRole="header" variant="heading">Move to monitor</AppText><ResponsiveGrid maxColumns={4} minItemWidth={96}>{(['left', 'up', 'down', 'right'] as const).map((direction) => register(`monitor.${direction}`, <ControlButton key={direction} label={direction[0]!.toUpperCase() + direction.slice(1)} disabled={!session.supports('pointer.display.move')} onPress={() => sendTuple(commandPayloads.displayMove(direction))} />))}</ResponsiveGrid></View> : null}
  </View>;

  const unavailable = [
    ['speed.slower', 'Slower'], ['speed.faster', 'Faster'],
    ...(['left', 'up', 'down', 'right'] as const).map((direction) => [`monitor.${direction}`, direction[0]!.toUpperCase() + direction.slice(1)]),
  ];
  for (const [id, label] of unavailable) if (!controls.some((item) => item.id === id)) controls.push({ id: id!, label: label!, disabled: true, onPress: () => undefined });
  return <View style={{ gap: spacing.md }}>
    {state.repeat ? <ActionButton icon="stop-circle" label="Stop movement" tone="danger" onPress={() => void session.stopRepeat()} /> : null}
    {state.repeat ? <StatusBadge icon="autorenew" label="Movement is repeating. Use Stop movement or another control to stop." tone="warning" /> : null}
    {Platform.OS === 'android' && !physicalSwitchStopAvailable && profile?.capabilities.mouseRepeat.supported && profile.capabilities.mouseRepeat.enabled ? <Card><AppText muted>Switchify is unavailable. Use a Remote control to stop movement repeat.</AppText></Card> : null}
    <SurfaceLayout surface="mouse" controls={controls} customStatus={speed?.supported ? <AppText accessibilityRole="header" variant="heading">Pointer speed · {speed.scalePercent}%</AppText> : null} blocked={state.repeat || state.dragging || state.modifiers.length ? 'Stop movement, end dragging, and release modifiers before editing.' : null}>
    <View style={{ alignItems: 'flex-start', flexDirection: twoPane ? 'row' : 'column', gap: spacing.xl }}>{movement}{secondary}</View>
    </SurfaceLayout>
  </View>;
}
