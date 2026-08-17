export type DiagnosticLevel = 'info' | 'warning' | 'error';
export type DiagnosticEntry = { id: number; timestamp: number; level: DiagnosticLevel; code: string; message: string };

const messages = {
  scan_started: 'Looking for nearby PCs.',
  scan_failed: 'Bluetooth discovery could not start.',
  connecting: 'Connecting to a PC.',
  connected: 'Connected to a PC.',
  pairing_requested: 'Pairing approval requested.',
  pairing_rejected: 'Pairing was not approved.',
  authentication_failed: 'Saved access is no longer valid.',
  disconnected: 'Disconnected from the PC.',
  command_failed: 'A remote command failed.',
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
    this.#entries = [{ id: this.#nextId++, timestamp: Date.now(), level, code, message: messages[code]! }, ...this.#entries].slice(0, 200);
    this.#listeners.forEach((listener) => listener());
  }
  clear(): void { this.#entries = []; this.#listeners.forEach((listener) => listener()); }
  export(): string { return this.#entries.map((entry) => `${new Date(entry.timestamp).toISOString()} [${entry.level}] ${entry.code}: ${entry.message}`).join('\n'); }
}
