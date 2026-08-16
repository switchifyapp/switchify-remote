import type { PcStatus } from '@/domain/protocol/types';

export type DiscoveredDesktop = PcStatus & { peripheralId: string; rssi: number | null };
export type Unsubscribe = () => void;

export interface BleTransport {
  scan(onDesktop: (desktop: DiscoveredDesktop) => void, onError: (error: Error) => void): Unsubscribe;
  connect(peripheralId: string): Promise<void>;
  disconnect(): Promise<void>;
  writeFrame(frameBase64: string): Promise<void>;
  subscribe(onFrame: (frameBase64: string) => void, onError: (error: Error) => void): Unsubscribe;
}
