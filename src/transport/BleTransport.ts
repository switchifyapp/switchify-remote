import type { PcStatus } from '@/domain/protocol/types';

export type DiscoveredDesktop = PcStatus & { peripheralId: string; rssi: number | null };
export type Unsubscribe = () => void;
export type BleAvailability = 'ready' | 'unauthorized' | 'poweredOff' | 'unsupported';

export interface BleTransport {
  availability(): Promise<BleAvailability>;
  scan(onDesktop: (desktop: DiscoveredDesktop) => void, onError: (error: Error) => void): Unsubscribe;
  connect(peripheralId: string): Promise<void>;
  resolveAndConnect(desktopId: string): Promise<DiscoveredDesktop>;
  disconnect(): Promise<void>;
  maxWriteValueBytes(): number;
  writeFrame(frameBase64: string): Promise<void>;
  cancelPendingWrites(): Promise<void>;
  verifyConnection(desktopId: string): Promise<boolean>;
  subscribe(onFrame: (frameBase64: string) => void, onError: (error: Error) => void): Unsubscribe;
  notificationsReady(): Promise<void>;
  subscribeDisconnect(onDisconnect: () => void): Unsubscribe;
}

/** The person closed a device chooser without choosing a PC, as browsers require for Web Bluetooth. */
export class BluetoothDeviceSelectionCancelledError extends Error {
  constructor() { super('Bluetooth device selection was cancelled.'); }
}

/** The browser refused to open its device picker: the tap was too long ago, or Bluetooth is blocked for the site. */
export class BluetoothPickerBlockedError extends Error {
  constructor() { super('The browser did not open the Bluetooth picker.'); }
}

export const BLUETOOTH_PICKER_BLOCKED_MESSAGE = 'Your browser did not open the Bluetooth picker. Try again, and allow Bluetooth for this site if it is blocked.';
