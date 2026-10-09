import type { DiagnosticLog } from '@/diagnostics/DiagnosticLog';
import type { BleTransport } from './BleTransport';
import { navigatorBluetooth, WebBluetoothTransport } from './WebBluetoothTransport';

export function createBleTransport(diagnostics: Pick<DiagnosticLog, 'addConnectionStage'>): BleTransport {
  return new WebBluetoothTransport(navigatorBluetooth, undefined, diagnostics);
}
