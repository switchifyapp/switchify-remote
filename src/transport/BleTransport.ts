import type { PcStatus } from '@/domain/protocol/types';

export type DiscoveredDesktop = PcStatus & { peripheralId: string; rssi: number | null };
export type Unsubscribe = () => void;
export type BleAvailability = 'ready' | 'unauthorized' | 'poweredOff' | 'unsupported';

export interface BleTransport {
  availability(): Promise<BleAvailability>;
  scan(onDesktop: (desktop: DiscoveredDesktop) => void, onError: (error: Error) => void): Unsubscribe;
  connect(peripheralId: string): Promise<void>;
  disconnect(): Promise<void>;
  maxWriteValueBytes(): number;
  writeFrame(frameBase64: string): Promise<void>;
  cancelPendingWrites(): Promise<void>;
  subscribe(onFrame: (frameBase64: string) => void, onError: (error: Error) => void): Unsubscribe;
  notificationsReady(): Promise<void>;
  subscribeDisconnect(onDisconnect: () => void): Unsubscribe;
}
