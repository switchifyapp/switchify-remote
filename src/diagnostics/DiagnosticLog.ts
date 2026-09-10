export type DiagnosticLevel = 'info' | 'warning' | 'error';
export type DiagnosticEntry = { id: number; timestamp: number; level: DiagnosticLevel; code: string; message: string };

const connectionStages = {
  connect: 'Connect to the selected PC',
  priority: 'Request Android connection priority (optional)',
  mtu: 'Negotiate Bluetooth MTU',
  services: 'Discover connection services',
  probe_connect: 'Connect for discovery status',
  probe_services: 'Discover status services',
  status_read: 'Read discovery status',
  notifications: 'Register notification listener',
  notification_ready: 'Verify Android notification descriptor',
} as const;
export type ConnectionStage = keyof typeof connectionStages;
export type ConnectionStageOutcome = 'started' | 'succeeded' | 'failed';

const messages = {
  scan_started: 'Looking for nearby PCs.',
  scan_failed: 'Bluetooth discovery could not start.',
  connecting: 'Connecting to a PC.',
  connected: 'Connected to a PC.',
  connection_lost: 'The connection to the PC was lost.',
  connection_health_failed: 'The PC did not respond to a Bluetooth connection check.',
  profile_recovery_started: 'Restoring remote controls.',
  profile_recovered: 'Remote controls were restored.',
  profile_recovery_exhausted: 'Remote controls could not be restored.',
  pairing_requested: 'Pairing approval requested.',
  pairing_rejected: 'Pairing was not approved.',
  authentication_failed: 'Saved access is no longer valid.',
  disconnected: 'Disconnected from the PC.',
  command_failed: 'A remote command failed.',
  remote_name_sync_failed: 'The Remote name could not be updated on the PC.',
  unpair_failed: 'A saved PC could not be removed.',
  cleanup_complete: 'Remote input state was cleaned up.',
} as const;

export class DiagnosticLog {
  #entries: DiagnosticEntry[] = [];
  #listeners = new Set<() => void>();
  #nextId = 1;
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  snapshot = () => this.#entries;
  add(code: keyof typeof messages, level: DiagnosticLevel = 'info'): void {
    this.#append(code, messages[code], level);
  }
  addConnectionStage(stage: ConnectionStage, outcome: ConnectionStageOutcome): void {
    // Only fixed vocabulary crosses this boundary: no native error, address or payload.
    this.#append(`ble_${stage}_${outcome}`, `${connectionStages[stage]}: ${outcome}.`, outcome === 'failed' ? 'warning' : 'info');
  }
  #append(code: string, message: string, level: DiagnosticLevel): void {
    this.#entries = [{ id: this.#nextId++, timestamp: Date.now(), level, code, message }, ...this.#entries].slice(0, 200);
    this.#listeners.forEach((listener) => listener());
  }
  clear(): void { this.#entries = []; this.#listeners.forEach((listener) => listener()); }
  export(): string { return this.#entries.map((entry) => `${new Date(entry.timestamp).toISOString()} [${entry.level}] ${entry.code}: ${entry.message}`).join('\n'); }
}
