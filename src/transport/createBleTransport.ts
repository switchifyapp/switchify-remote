import type { DiagnosticLog } from '@/diagnostics/DiagnosticLog';
import type { BleTransport } from './BleTransport';
import { ReactNativeBleTransport } from './ReactNativeBleTransport';

export function createBleTransport(diagnostics: Pick<DiagnosticLog, 'addConnectionStage'>): BleTransport {
  return new ReactNativeBleTransport(null, undefined, undefined, undefined, diagnostics);
}
