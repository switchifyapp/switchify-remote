import {
  DEFAULT_SWITCH_SETTINGS,
  resolveOptions,
  validateSwitchSettings,
  type Pattern,
  type ScanAction,
  type SwitchBinding,
  type SwitchSettings,
} from '@switchify/scanning';

export type ScanningPreferences = {
  enabled: boolean;
  automatic: boolean;
  intervalMs: number;
  pattern: Pattern;
  /** With the grouped pattern, scan each grid row as a group inside its section. */
  rows: boolean;
  switches: SwitchSettings;
};

export const SCAN_SPEEDS_MS = [500, 750, 1_000, 1_500, 2_000, 3_000] as const;

export const DEFAULT_SCANNING: ScanningPreferences = {
  enabled: false,
  automatic: true,
  intervalMs: 1_000,
  pattern: 'grouped',
  rows: false,
  switches: { holdIntervalMs: DEFAULT_SWITCH_SETTINGS.holdIntervalMs, bindings: DEFAULT_SWITCH_SETTINGS.bindings.map((binding) => ({ ...binding, holdActions: [...binding.holdActions] })) },
};

const ACTIONS: readonly ScanAction[] = ['select', 'next', 'back', 'pause', 'reverse', 'stop'];

function binding(value: unknown): SwitchBinding | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<SwitchBinding>;
  if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.key !== 'string') return null;
  if (!ACTIONS.includes(item.pressAction as ScanAction) || !Array.isArray(item.holdActions)) return null;
  const holdActions = item.holdActions.filter((action): action is ScanAction => ACTIONS.includes(action as ScanAction));
  return { id: item.id, name: item.name, key: item.key, pressAction: item.pressAction as ScanAction, holdActions };
}

/** Keeps every stored choice that is still valid; anything else falls back on its own. */
export function normalizeScanning(raw: unknown): ScanningPreferences {
  if (!raw || typeof raw !== 'object') return DEFAULT_SCANNING;
  const value = raw as Partial<Record<keyof ScanningPreferences, unknown>>;
  const options = resolveOptions({
    automatic: typeof value.automatic === 'boolean' ? value.automatic : DEFAULT_SCANNING.automatic,
    intervalMs: typeof value.intervalMs === 'number' ? value.intervalMs : DEFAULT_SCANNING.intervalMs,
    pattern: value.pattern as Pattern,
  });
  const storedSwitches = value.switches as Partial<SwitchSettings> | undefined;
  const bindings = Array.isArray(storedSwitches?.bindings) ? storedSwitches.bindings.map(binding) : null;
  const switches: SwitchSettings = bindings && bindings.every((item) => item !== null) && typeof storedSwitches?.holdIntervalMs === 'number'
    ? { holdIntervalMs: storedSwitches.holdIntervalMs, bindings: bindings as SwitchBinding[] }
    : DEFAULT_SCANNING.switches;
  return {
    enabled: value.enabled === true,
    automatic: options.automatic,
    intervalMs: options.intervalMs,
    pattern: options.pattern,
    rows: value.rows === true,
    switches: validateSwitchSettings(switches, options.automatic) === null ? switches : DEFAULT_SCANNING.switches,
  };
}

/** A readable name for a KeyboardEvent.code, for showing which key a switch sends. */
export function keyLabel(code: string): string {
  if (code === 'Space') return 'Space';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Keypad ${code.slice(6)}`;
  if (code.startsWith('Arrow')) return `${code.slice(5)} arrow`;
  return code;
}
