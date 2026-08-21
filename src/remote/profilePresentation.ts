import type { ConnectionState } from '@/connection/ConnectionManager';

export type ProfileStatus = Extract<ConnectionState, { kind: 'connected' }>['profileStatus'];

export function profileStatusAnnouncement(status: ProfileStatus | null, previous: ProfileStatus | null): string | null {
  if (status === 'recovering') return 'Restoring controls.';
  if (status === 'unavailable') return 'Controls unavailable.';
  if (status === 'ready' && previous === 'recovering') return 'Controls restored.';
  return null;
}

export function profilePresentation(status: ProfileStatus) {
  if (status === 'recovering') {
    return {
    title: 'Restoring controls',
      body: 'Switchify Remote is retrying the control profile in the background.',
      icon: 'sync' as const,
    };
  }
  if (status === 'unavailable') {
    return {
      title: 'Controls unavailable',
      body: 'This computer did not provide a compatible remote-control profile. Reconnect after updating Switchify PC.',
      icon: 'portable-wifi-off' as const,
    };
  }
  return {
    title: 'Controls restored',
    body: '',
    icon: 'check-circle' as const,
  };
}
