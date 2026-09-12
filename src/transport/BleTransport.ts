import type { PcStatus } from '@/domain/protocol/types';
import type { DiagnosticAttempt } from '@/diagnostics/DiagnosticLog';

export type DiscoveredDesktop = PcStatus & { peripheralId: string; rssi: number | null };
export type Unsubscribe = () => void;
export type BleAvailability = 'ready' | 'unauthorized' | 'poweredOff' | 'unsupported';

export interface BleTransport {
  availability(): Promise<BleAvailability>;
  scan(onDesktop: (desktop: DiscoveredDesktop) => void, onError: (error: Error) => void): Unsubscribe;
  connect(peripheralId: string, attempt?: DiagnosticAttempt): Promise<void>;
  resolveAndConnect(desktopId: string, attempt?: DiagnosticAttempt): Promise<DiscoveredDesktop>;
  disconnect(): Promise<void>;
  maxWriteValueBytes(): number;
  writeFrame(frameBase64: string): Promise<void>;
  cancelPendingWrites(): Promise<void>;
  verifyConnection(desktopId: string): Promise<boolean>;
  subscribe(onFrame: (frameBase64: string) => void, onError: (error: Error) => void): Unsubscribe;
  notificationsReady(): Promise<void>;
  subscribeDisconnect(onDisconnect: () => void): Unsubscribe;
}
