import type { PcStatus } from '@/domain/protocol/types';

const PRODUCT_NAME = 'Switchify PC';

export type BluetoothDeviceNames = {
  name: string | null | undefined;
  localName: string | null | undefined;
};

export function desktopDisplayName(status: PcStatus, bluetooth: BluetoothDeviceNames, remotePlatform: string): string {
  const statusName = normalized(status.displayName);
  if (status.platform === 'macos') return statusName ?? PRODUCT_NAME;
  const deviceName = normalized(bluetooth.name);
  const localName = normalized(bluetooth.localName);
  const candidates = remotePlatform === 'ios'
    ? [localName, deviceName, statusName]
    : [deviceName, localName, statusName];
  return candidates.find((candidate) => candidate !== null && !isGeneric(candidate))
    ?? candidates.find((candidate) => candidate !== null)
    ?? PRODUCT_NAME;
}

function normalized(value: string | null | undefined): string | null {
  const name = value?.trim();
  return name ? name : null;
}

function isGeneric(value: string): boolean {
  return value.toLowerCase() === PRODUCT_NAME.toLowerCase();
}
