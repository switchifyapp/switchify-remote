import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ControlButton } from '@/components/ControlButton';
import { ListRow } from '@/components/ListRow';
import { ResponsiveGrid } from '@/components/ResponsiveGrid';
import { Screen } from '@/components/Screen';
import { StatusBadge } from '@/components/StatusBadge';
import type { ConnectionManager } from '@/connection/ConnectionManager';
import type { PointerProfile } from '@/domain/protocol/types';
import { MouseSurface } from '@/remote/MouseSurface';
import { RemoteSession } from '@/remote/RemoteSession';
import { TypingSurface } from '@/remote/TypingSurface';
import { WindowSurface } from '@/remote/WindowSurface';
import type { SwitchifyBridge } from '@/bridge/types';
import { useTheme } from '@/theme/ThemeContext';

export type StoreCaptureShot = 'pair' | 'mouse' | 'typing' | 'window' | 'access';

const shots = new Set<StoreCaptureShot>(['pair', 'mouse', 'typing', 'window', 'access']);
const captureSequence: StoreCaptureShot[] = ['pair', 'mouse', 'typing', 'window', 'access'];
const commands = [
  'mouse.move', 'mouse.click', 'mouse.doubleClick', 'mouse.rightClick', 'mouse.dragStart', 'mouse.dragEnd', 'mouse.scroll',
  'mouse.repeat.start', 'mouse.repeat.stop', 'pointer.speed.set', 'pointer.display.move',
  'keyboard.typeText', 'keyboard.key', 'keyboard.textStream.open', 'keyboard.textStream.chunk', 'keyboard.textStream.key',
  'keyboard.textStream.close', 'keyboard.modifierDown', 'keyboard.modifierUp', 'keyboard.shortcut', 'window.control',
];

const profile: PointerProfile = {
  displayId: 'capture-display',
  scaleFactor: 2,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  maxDelta: 256,
  recommendedDeltas: { small: 32, medium: 64, large: 128 },
  capabilities: {
    noAckMouseMove: true,
    noAckCommands: ['mouse.move'],
    supportedCommands: commands,
    mouseRepeat: { supported: true, enabled: true, intervalMs: 250, minIntervalMs: 100, maxIntervalMs: 2_000 }, keyRepeat: { supported: true, enabled: true, intervalMs: 250, initialDelayMs: 500, minIntervalMs: 100, maxIntervalMs: 1000, repeatableKeys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace', 'Delete', 'PageUp', 'PageDown'] },
    pointerSpeed: { supported: true, setSupported: true, scalePercent: 75, minScalePercent: 5, maxScalePercent: 225, stepPercent: 5, baseMoveDelta: 64, effectiveMoveDelta: 48 },
    displayNavigation: { supported: true, displayCount: 2 },
  },
};

const captureBridge: SwitchifyBridge = {
  snapshot: () => ({ version: 0, captureAvailable: false, externalSwitches: [] }),
  subscribe: () => () => undefined,
  connect: async () => false,
  disconnect: async () => undefined,
  nextGeneration: () => 0,
  setRepeatActive: async () => false,
  setForwardingActive: async () => false,
};

const captureManager = {
  send: async () => false,
} as unknown as ConnectionManager;

export function storeCaptureEnabled(value = process.env.EXPO_PUBLIC_STORE_CAPTURE): boolean {
  return value === '1';
}

export function storeCaptureShot(url: string | null | undefined): StoreCaptureShot | null {
  if (!url) return null;
  const match = url.match(/^switchify-remote:\/\/capture\/(pair|mouse|typing|window|access)(?:[/?#]|$)/);
  return match && shots.has(match[1] as StoreCaptureShot) ? match[1] as StoreCaptureShot : null;
}

export function StoreCaptureRoot() {
  const [shot, setShot] = useState<StoreCaptureShot>('pair');
  useEffect(() => {
    const apply = (url: string | null | undefined) => {
      const next = storeCaptureShot(url);
      if (next) setShot(next);
    };
    void Linking.getInitialURL().then(apply);
    const subscription = Linking.addEventListener('url', ({ url }) => apply(url));
    const sequence = setInterval(() => setShot((current) => captureSequence[(captureSequence.indexOf(current) + 1) % captureSequence.length] ?? 'pair'), 5_000);
    return () => {
      clearInterval(sequence);
      subscription.remove();
    };
  }, []);
  return <><CaptureScreen shot={shot} /><StatusBar style="light" /></>;
}

function CaptureScreen({ shot }: { shot: StoreCaptureShot }) {
  const session = useMemo(() => new RemoteSession(captureManager, profile, () => 'capture', 'capture-desktop', captureBridge), []);
  useEffect(() => () => session.dispose(), [session]);
  const tab = shot === 'pair' ? 'pcs' : shot === 'access' ? 'settings' : 'remote';
  return <View style={{ flex: 1 }} testID={`store-capture-${shot}`}>
    {shot === 'pair' ? <PairCapture /> : null}
    {shot === 'mouse' ? <RemoteCapture title="Mouse"><MouseSurface physicalSwitchStopAvailable={false} session={session} state={session.snapshot()} /></RemoteCapture> : null}
    {shot === 'typing' ? <RemoteCapture title="Typing"><TypingSurface draft="" mode="live" session={session} /></RemoteCapture> : null}
    {shot === 'window' ? <RemoteCapture title="Window"><WindowSurface platform="windows" session={session} state={session.snapshot()} /></RemoteCapture> : null}
    {shot === 'access' ? <AccessCapture /> : null}
    <CaptureTabBar selected={tab} />
  </View>;
}

function PairCapture() {
  return <Screen title="PCs" description="Connect directly to a nearby approved computer over Bluetooth.">
    <Card variant="hero">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View><AppText accessibilityRole="header" variant="heading">Demo PC</AppText><AppText muted>Windows · Saved</AppText></View>
        <StatusBadge icon="check-circle" label="Approved" tone="success" />
      </View>
      <AppText muted>Pairing approval keeps control limited to computers you trust.</AppText>
      <ControlButton label="Connect" onPress={() => undefined} />
    </Card>
    <Card>
      <ListRow icon="bluetooth-searching" title="Find nearby PCs" description="Compare the six-digit code before approving a new computer." />
    </Card>
  </Screen>;
}

function RemoteCapture({ children, title }: { children: ReactNode; title: string }) {
  return <Screen title="Remote" description={title} headerAccessory={<StatusBadge icon="check-circle" label="Connected · Demo PC" tone="success" />}>
    {children}
  </Screen>;
}

function AccessCapture() {
  return <Screen title="Settings" description="Preferences are stored only on this device.">
    <Card><AppText accessibilityRole="header" variant="heading">Opening surface</AppText><ResponsiveGrid maxColumns={3} minItemWidth={100}><ControlButton label="Mouse" selected onPress={() => undefined} /><ControlButton label="Typing" onPress={() => undefined} /><ControlButton label="Window" onPress={() => undefined} /></ResponsiveGrid></Card>
    <Card><AppText accessibilityRole="header" variant="heading">Pointer controls</AppText><ListRow icon="speed" title="Pointer speed" description="75%" /><ListRow icon="repeat" title="Movement repeat" description="On" /><ListRow icon="desktop-windows" title="Displays" description="2" /></Card>
    <Card><ListRow icon="shield" title="Privacy policy" description="How Switchify Remote handles data." /><ListRow icon="troubleshoot" title="Diagnostics" description="Sanitized connection activity stored on this device." /></Card>
  </Screen>;
}

function CaptureTabBar({ selected }: { selected: 'pcs' | 'remote' | 'settings' }) {
  const { colors, spacing, typography } = useTheme();
  const items = [['pcs', 'computer', 'PCs'], ['remote', 'settings-remote', 'Remote'], ['settings', 'settings', 'Settings']] as const;
  return <View style={{ backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', minHeight: 64 }}>
    {items.map(([key, icon, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: selected === key }} style={{ alignItems: 'center', flex: 1, gap: spacing.xs, justifyContent: 'center', paddingVertical: spacing.sm }}>
      <MaterialIcons color={selected === key ? colors.brandText : colors.textMuted} name={icon} size={24} />
      <AppText style={[typography.caption, { color: selected === key ? colors.brandText : colors.textMuted }]}>{label}</AppText>
    </Pressable>)}
  </View>;
}
