import type { PcStatus } from '@/domain/protocol/types';

const PRODUCT_NAME = 'Switchify PC';

export function desktopDisplayName(status: PcStatus, bluetoothDeviceName: string | null | undefined): string {
  const statusName = normalized(status.displayName);
  if (status.platform === 'macos') return statusName ?? PRODUCT_NAME;
  return normalized(bluetoothDeviceName) ?? statusName ?? PRODUCT_NAME;
}

function normalized(value: string | null | undefined): string | null {
  const name = value?.trim();
  return name ? name : null;
}
