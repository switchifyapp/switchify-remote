import { ActionButton } from '@/components/ActionButton';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { useAccessibilityAnnouncement } from '@/components/useAccessibilityAnnouncement';
import type { ConnectionState } from '@/connection/ConnectionManager';
import type { RemoteSurface } from '@/storage/PreferencesStore';
import { SurfaceSelector } from './SurfaceSelector';

type DisconnectedState = Exclude<ConnectionState, { kind: 'connected' }>;

export type DisconnectedRemotePresentation = {
  busy: boolean;
  title: string;
  message: string;
  primaryAction: 'Retry' | null;
  chooseAction: 'Find a PC' | 'Choose another PC' | null;
};

export function disconnectedRemotePresentation(connection: DisconnectedState): DisconnectedRemotePresentation {
  const saved = 'saved' in connection ? connection.saved : [];
  const busy = connection.kind === 'connecting' || connection.kind === 'pairing' || connection.kind === 'reconnecting';
  const message = connection.kind === 'connecting' ? `Connecting to ${connection.desktop.displayName}.`
    : connection.kind === 'reconnecting' ? `Reconnecting to ${connection.desktop.displayName}, attempt ${connection.attempt}.`
      : connection.kind === 'pairing' ? `Waiting for pairing approval for ${connection.desktop.displayName}.`
        : connection.kind === 'failed' ? connection.message
          : connection.kind === 'permissionDenied' ? 'Bluetooth permission is required before connecting.'
            : connection.kind === 'bluetoothOff' ? 'Turn on Bluetooth, then try again.'
              : connection.kind === 'unsupported' ? 'Bluetooth is unavailable on this device.'
                : saved.length === 0 ? 'Pair a PC before using remote controls.' : 'Preparing your preferred PC.';
  return {
    busy,
    title: busy ? 'Connecting' : connection.kind === 'failed' ? 'Could not connect' : saved.length === 0 ? 'No saved PCs' : 'Connect your PC',
    message,
    primaryAction: !busy && saved.length > 0 ? 'Retry' : null,
    chooseAction: busy ? null : saved.length === 0 ? 'Find a PC' : 'Choose another PC',
  };
}

export function DisconnectedRemote({ connection, selectedSurface, retry, choose }: { connection: DisconnectedState; selectedSurface: RemoteSurface; retry: () => void; choose: () => void }) {
  const presentation = disconnectedRemotePresentation(connection);
  useAccessibilityAnnouncement(presentation.message);
  return (
    <Screen title="Remote" description="Your selected controls will be ready after connection.">
      <SurfaceSelector selected={selectedSurface} />
      <EmptyState title={presentation.title} body={presentation.message} />
      {presentation.busy ? <ActionButton label="Connecting…" busy disabled onPress={() => undefined} /> : null}
      {presentation.primaryAction ? <ActionButton label={presentation.primaryAction} onPress={retry} /> : null}
      {presentation.chooseAction ? <ActionButton label={presentation.chooseAction} secondary onPress={choose} /> : null}
    </Screen>
  );
}
