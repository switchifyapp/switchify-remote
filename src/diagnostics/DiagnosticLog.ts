export type DiagnosticLevel = 'info' | 'warning' | 'error';
export type DiagnosticEntry = { id: number; timestamp: number; level: DiagnosticLevel; code: string; message: string };
export type AttemptSource = 'nearby' | 'saved' | 'preferred' | 'switch' | 'reconnect';
export type DiagnosticAttempt = Readonly<{ attempt: number; pc: number; source: AttemptSource }>;

const connectionStages = {
  connect: 'Connect to the selected PC',
  priority: 'Request Android connection priority (optional)',
  mtu: 'Negotiate Bluetooth MTU',
  services: 'Discover connection services',
  probe_connect: 'Connect for discovery status',
  probe_services: 'Discover status services',
  status_read: 'Read discovery status',
  status_parse: 'Parse discovery status',
  selected_match: 'Match discovery status to the selected PC',
  resolution: 'Resolve and prepare the selected PC connection',
  notifications: 'Register notification listener',
  notification_ready: 'Verify Android notification descriptor',
  response_read_ready: 'Prepare read-based responses',
} as const;
export type ConnectionStage = keyof typeof connectionStages;
export type ConnectionStageOutcome = 'started' | 'succeeded' | 'failed' | 'not_matched' | 'timed_out';

const messages = {
  attempt_started: 'Connection attempt started.',
  attempt_superseded: 'A new connection request superseded this attempt.',
  teardown_requested: 'Explicit disconnect requested.',
  teardown_switch: 'Switch to another saved PC requested.',
  teardown_scan: 'Disconnect to start discovery.',
  teardown_focus: 'Preferred connection cancelled when leaving the screen.',
  teardown_failure: 'Connection attempt failed; cleaning up.',
  teardown_native: 'Native Bluetooth disconnect observed.',
  teardown_response: 'Response channel failed.',
  teardown_write: 'Bluetooth write failed.',
  teardown_health: 'Connection health check failed.',
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
  #nextAttempt = 1;
  #nextPc = 1;
  #pcs = new Map<string, number>();
  #attempts = new WeakSet<DiagnosticAttempt>();
  beginAttempt(desktopId: string, source: AttemptSource): DiagnosticAttempt {
    const safeSource: AttemptSource = ['nearby', 'saved', 'preferred', 'switch', 'reconnect'].includes(source) ? source : 'saved';
    const attempt = Object.freeze({ attempt: this.#nextAttempt++, pc: this.#pc(desktopId), source: safeSource });
    this.#attempts.add(attempt);
    this.add('attempt_started', 'info', attempt);
    return attempt;
  }
  #pc(desktopId: string): number {
    const existing = this.#pcs.get(desktopId);
    if (existing !== undefined) return existing;
    const pc = this.#nextPc++;
    if (desktopId.length <= 128) {
      if (this.#pcs.size >= 128) this.#pcs.delete(this.#pcs.keys().next().value!);
      this.#pcs.set(desktopId, pc);
    }
    return pc;
  }
  peerObserved(desktopId: string, readReplies: boolean, attempt?: DiagnosticAttempt, matchesSelected = false): void {
    if (!attempt || !this.#attempts.has(attempt)) return;
    this.#append('ble_peer_observed', `Observed PC-${matchesSelected ? attempt.pc : this.#pc(desktopId)}; replies=${readReplies ? 'read-v1' : 'notifications'}.`, 'info', attempt);
  }
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  snapshot = () => this.#entries;
  add(code: keyof typeof messages, level: DiagnosticLevel = 'info', attempt?: DiagnosticAttempt): void {
    this.#append(code, messages[code], level, attempt);
  }
  addConnectionStage(stage: ConnectionStage, outcome: ConnectionStageOutcome, attempt?: DiagnosticAttempt): void {
    // Only fixed vocabulary crosses this boundary: no native error, address or payload.
    this.#append(`ble_${stage}_${outcome}`, `${connectionStages[stage]}: ${outcome}.`, outcome === 'failed' || outcome === 'timed_out' ? 'warning' : 'info', attempt);
  }
  #append(code: string, message: string, level: DiagnosticLevel, attempt?: DiagnosticAttempt): void {
    if (attempt && this.#attempts.has(attempt)) message = `[attempt-${attempt.attempt} PC-${attempt.pc} ${attempt.source}] ${message}`;
    this.#entries = [{ id: this.#nextId++, timestamp: Date.now(), level, code, message }, ...this.#entries].slice(0, 200);
    this.#listeners.forEach((listener) => { try { listener(); } catch { /* Diagnostics must not affect connections. */ } });
  }
  clear(): void { this.#entries = []; this.#pcs.clear(); this.#attempts = new WeakSet(); this.#listeners.forEach((listener) => { try { listener(); } catch { /* Observer isolation. */ } }); }
  export(): string { return this.#entries.map((entry) => `${new Date(entry.timestamp).toISOString()} [${entry.level}] ${entry.code}: ${entry.message}`).join('\n'); }
}
