import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useBridgeSnapshot, useSwitchifyBridge } from '@/bridge/BridgeContext';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { useConnectionManager, useConnectionState } from '@/connection/ConnectionContext';
import { MouseSurface } from '@/remote/MouseSurface';
import { RemoteSession } from '@/remote/RemoteSession';
import { SurfaceSelector } from '@/remote/SurfaceSelector';
import { TypingSurface } from '@/remote/TypingSurface';
import { WindowSurface } from '@/remote/WindowSurface';
import { usePreferences } from '@/storage/usePreferences';
import { preferencesStore } from '@/storage/PreferencesStore';

export default function RemoteScreen() {
  const manager = useConnectionManager();
  const bridge = useSwitchifyBridge();
  const bridgeSnapshot = useBridgeSnapshot();
  const params = useLocalSearchParams<{ surface?: string }>();
  const connection = useConnectionState();
  const preferences = usePreferences();
  const profile = connection.kind === 'connected' ? connection.profile : null;
  const desktopId = connection.kind === 'connected' ? connection.desktop.desktopId : null;
  const session = useMemo(() => new RemoteSession(manager, profile, undefined, desktopId, bridge), [manager, desktopId, profile, bridge]);
  const sessionState = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  useEffect(() => { if (params.surface === 'mouse') void preferencesStore.update({ surface: 'mouse' }); }, [params.surface]);
  useEffect(() => manager.registerCleanup(() => session.cleanup()), [manager, session]);
  useEffect(() => () => { void session.cleanup(); session.dispose(); }, [session]);
  if (connection.kind !== 'connected') return <Screen title="Remote"><EmptyState title="Connect a PC" body="Choose a saved or nearby PC before opening remote controls." /></Screen>;
  if (!connection.profile) return <Screen title="Remote"><EmptyState title="Controls unavailable" body="This PC did not provide a compatible remote-control profile. Reconnect after updating Switchify PC." /></Screen>;
  return (
    <Screen title="Remote" description={`Connected to ${connection.desktop.displayName}`}>
      <SurfaceSelector selected={preferences.surface} />
      {preferences.surface === 'mouse' ? <MouseSurface session={session} state={sessionState} physicalSwitchStopAvailable={bridgeSnapshot.captureAvailable} /> : null}
      {preferences.surface === 'typing' ? <TypingSurface session={session} mode={preferences.typingMode} draft={preferences.draft} /> : null}
      {preferences.surface === 'window' ? <WindowSurface session={session} state={sessionState} platform={connection.desktop.platform} /> : null}
    </Screen>
  );
}
