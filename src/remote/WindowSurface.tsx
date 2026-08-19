import { View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ControlButton } from '@/components/ControlButton';
import { commandPayloads } from '@/domain/protocol/commands';
import type { PcPlatform } from '@/domain/protocol/types';
import { useTheme } from '@/theme/ThemeContext';
import type { RemoteSession, RemoteSessionState } from './RemoteSession';

const actions = [['Next app', 'switchNext'], ['Previous app', 'switchPrevious'], ['Task view', 'taskView'], ['Show desktop', 'showDesktop'], ['Minimize', 'minimizeFocused'], ['Maximize', 'maximizeFocused'], ['Close', 'closeFocused']] as const;

export function WindowSurface({ session, state, platform }: { session: RemoteSession; state: RemoteSessionState; platform: PcPlatform }) {
  const labels: Record<string, string> = platform === 'macos' ? { Ctrl: 'Control', Alt: 'Option', Shift: 'Shift', Meta: 'Command' } : { Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Start' };
  const { spacing } = useTheme();
  return <View style={{ gap: spacing.md }}>
    <Card><AppText accessibilityRole="header" variant="heading">Modifiers</AppText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{Object.entries(labels).map(([key, label]) => <ControlButton key={key} label={label} disabled={!session.supports(state.modifiers.includes(key) ? 'keyboard.modifierUp' : 'keyboard.modifierDown')} selected={state.modifiers.includes(key)} onPress={() => void session.toggleModifier(key)} />)}</View><AppText muted variant="caption">Held modifiers stay active until selected again, used in a shortcut, or the remote disconnects.</AppText></Card>
    <Card><AppText accessibilityRole="header" variant="heading">Windows</AppText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{actions.map(([label, action]) => <View key={action} style={{ flexBasis: '30%', flexGrow: 1 }}><ControlButton {...(action === 'closeFocused' ? { icon: 'warning' as const } : {})} label={label} danger={action === 'closeFocused'} disabled={!session.supports('window.control')} onPress={() => { const [type, payload] = commandPayloads.windowControl(action); void session.command(type, payload); }} /></View>)}</View></Card>
    <Card><AppText accessibilityRole="header" variant="heading">Shortcuts</AppText><View style={{ flexDirection: 'row', gap: spacing.sm }}>{['A', 'C', 'V', 'X'].map((key) => <ControlButton key={key} label={`${state.modifiers.length ? state.modifiers.map((item) => labels[item]).join('+') + '+' : ''}${key}`} disabled={!session.supports('keyboard.shortcut')} onPress={() => void session.shortcut(key)} />)}</View></Card>
    {session.profile?.capabilities.displayNavigation.supported && session.profile.capabilities.displayNavigation.displayCount > 1 ? <Card><AppText accessibilityRole="header" variant="heading">Move pointer to monitor</AppText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{(['left', 'up', 'down', 'right'] as const).map((direction) => <ControlButton key={direction} label={direction[0]!.toUpperCase() + direction.slice(1)} disabled={!session.supports('pointer.display.move')} onPress={() => { const [type, payload] = commandPayloads.displayMove(direction); void session.command(type, payload); }} />)}</View></Card> : null}
  </View>;
}
