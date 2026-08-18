import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useBridgeSnapshot, useSwitchifyBridge } from '@/bridge/BridgeContext';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { useConnectionManager, useConnectionState } from '@/connection/ConnectionContext';
import { usePreferredPcConnection } from '@/connection/usePreferredPcConnection';
import { MouseSurface } from '@/remote/MouseSurface';
import { DisconnectedRemote } from '@/remote/DisconnectedRemote';
import { RemoteSession } from '@/remote/RemoteSession';
import { SurfaceSelector } from '@/remote/SurfaceSelector';
import { TypingSurface } from '@/remote/TypingSurface';
import { WindowSurface } from '@/remote/WindowSurface';
import { usePreferences } from '@/storage/usePreferences';
import { preferencesStore } from '@/storage/PreferencesStore';
import { ForwardingRestoreState, ForwardingSurface, shouldClearForwardingRestore } from '@/forwarding/ForwardingSurface';

export default function RemoteScreen() {
  const manager = useConnectionManager();
  const router = useRouter();
  const bridge = useSwitchifyBridge();
  const bridgeSnapshot = useBridgeSnapshot();
  const params = useLocalSearchParams<{ surface?: string }>();
  const connection = useConnectionState();
  const preferences = usePreferences();
  const forwardingRestore = useMemo(() => new ForwardingRestoreState(), []);
  const profile = connection.kind === 'connected' ? connection.profile : null;
  const desktopId = connection.kind === 'connected' ? connection.desktop.desktopId : null;
  const session = useMemo(() => new RemoteSession(manager, profile, undefined, desktopId, bridge), [manager, desktopId, profile, bridge]);
  const sessionState = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  usePreferredPcConnection(manager);
  useEffect(() => { if (params.surface === 'mouse' || params.surface === 'forwarding') void preferencesStore.update({ surface: params.surface }); }, [params.surface]);
  useEffect(() => manager.registerCleanup(() => session.cleanup()), [manager, session]);
  useEffect(() => () => { void session.cleanup(); session.dispose(); }, [session]);
  useEffect(() => {
    if (shouldClearForwardingRestore(preferences.surface, connection.kind)) forwardingRestore.clear();
  }, [connection.kind, forwardingRestore, preferences.surface]);
  if (connection.kind !== 'connected') return <DisconnectedRemote connection={connection} selectedSurface={preferences.surface} retry={() => void manager.connectPreferred()} choose={() => router.navigate('/')} />;
  if (!connection.profile) return <Screen title="Remote"><EmptyState title="Controls unavailable" body="This PC did not provide a compatible remote-control profile. Reconnect after updating Switchify PC." /></Screen>;
  return (
    <Screen title="Remote" description={`Connected to ${connection.desktop.displayName}`}>
      <SurfaceSelector selected={preferences.surface} />
      {preferences.surface === 'mouse' ? <MouseSurface session={session} state={sessionState} physicalSwitchStopAvailable={bridgeSnapshot.captureAvailable && bridgeSnapshot.externalSwitches.length > 0} /> : null}
      {preferences.surface === 'typing' ? <TypingSurface session={session} mode={preferences.typingMode} draft={preferences.draft} /> : null}
      {preferences.surface === 'window' ? <WindowSurface session={session} state={sessionState} platform={connection.desktop.platform} /> : null}
      {preferences.surface === 'forwarding' ? <ForwardingSurface manager={manager} bridge={bridge} profile={connection.profile} desktopId={connection.desktop.desktopId} preferences={preferences} restore={forwardingRestore} /> : null}
    </Screen>
  );
}
