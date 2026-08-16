import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { useConnectionManager, useConnectionState } from '@/connection/ConnectionContext';
import { MouseSurface } from '@/remote/MouseSurface';
import { RemoteSession } from '@/remote/RemoteSession';
import { SurfaceSelector } from '@/remote/SurfaceSelector';
import { TypingSurface } from '@/remote/TypingSurface';
import { WindowSurface } from '@/remote/WindowSurface';
import { usePreferences } from '@/storage/usePreferences';

export default function RemoteScreen() {
  const manager = useConnectionManager();
  const connection = useConnectionState();
  const preferences = usePreferences();
  const profile = connection.kind === 'connected' ? connection.profile : null;
  const desktopId = connection.kind === 'connected' ? connection.desktop.desktopId : null;
  const session = useMemo(() => new RemoteSession(manager, profile, undefined, desktopId), [manager, desktopId, profile]);
  const sessionState = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  useEffect(() => manager.registerCleanup(() => session.cleanup()), [manager, session]);
  useEffect(() => () => { void session.cleanup(); }, [session]);
  if (connection.kind !== 'connected') return <Screen title="Remote"><EmptyState title="Connect a PC" body="Choose a saved or nearby PC before opening remote controls." /></Screen>;
  return (
    <Screen title="Remote" description={`Connected to ${connection.desktop.displayName}`}>
      <SurfaceSelector selected={preferences.surface} />
      {preferences.surface === 'mouse' ? <MouseSurface session={session} state={sessionState} /> : null}
      {preferences.surface === 'typing' ? <TypingSurface session={session} mode={preferences.typingMode} draft={preferences.draft} /> : null}
      {preferences.surface === 'window' ? <WindowSurface session={session} state={sessionState} platform={connection.desktop.platform} /> : null}
    </Screen>
  );
}
