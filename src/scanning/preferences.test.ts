import { DEFAULT_SCANNING, keyLabel, normalizeScanning, withManualSwitches } from './preferences';

describe('scanning preferences', () => {
  it('are off by default with a Select and a Next switch', () => {
    expect(normalizeScanning(undefined)).toEqual(DEFAULT_SCANNING);
    expect(DEFAULT_SCANNING.enabled).toBe(false);
    expect(DEFAULT_SCANNING.switches.bindings.map((binding) => [binding.key, binding.pressAction])).toEqual([['Space', 'select'], ['Enter', 'next']]);
  });

  it('keep stored choices that are still valid', () => {
    const stored = {
      enabled: true,
      automatic: false,
      intervalMs: 1_500,
      pattern: 'linear',
      rows: false,
      switches: { holdIntervalMs: 800, bindings: [
        { id: 'a', name: 'Select', key: 'Digit1', pressAction: 'select', holdActions: ['reverse'] },
        { id: 'b', name: 'Next', key: 'Digit2', pressAction: 'next', holdActions: [] },
        { id: 'c', name: 'Previous', key: 'Digit3', pressAction: 'back', holdActions: [] },
      ] },
    };
    expect(normalizeScanning(stored)).toEqual(stored);
  });

  it('let an unknown or unusable choice fall back on its own', () => {
    const result = normalizeScanning({ enabled: 'yes', automatic: true, intervalMs: 5, pattern: 'zigzag', switches: { holdIntervalMs: 1_000, bindings: [{ id: 'a', name: 'A', key: 'Space', pressAction: 'fly', holdActions: [] }] } });
    expect(result).toEqual({ ...DEFAULT_SCANNING, enabled: false });
  });

  it('replace switches that could not drive the chosen movement', () => {
    const manualWithoutPrevious = normalizeScanning({ automatic: false, switches: DEFAULT_SCANNING.switches });
    expect(manualWithoutPrevious.automatic).toBe(false);
    expect(manualWithoutPrevious.switches).toEqual(DEFAULT_SCANNING.switches);
  });

  it('names keys the way people know them', () => {
    expect(keyLabel('Space')).toBe('Space');
    expect(keyLabel('KeyA')).toBe('A');
    expect(keyLabel('Digit1')).toBe('1');
    expect(keyLabel('Numpad5')).toBe('Keypad 5');
    expect(keyLabel('ArrowUp')).toBe('Up arrow');
    expect(keyLabel('F8')).toBe('F8');
  });

  it('keep row scanning only when it was chosen', () => {
    expect(normalizeScanning({ pattern: 'grouped', rows: true }).rows).toBe(true);
    expect(normalizeScanning({ pattern: 'grouped', rows: 'yes' }).rows).toBe(false);
    expect(DEFAULT_SCANNING.rows).toBe(false);
  });

  it('add the Next and Previous switches manual scanning needs, on free keys', () => {
    const manual = withManualSwitches(DEFAULT_SCANNING.switches);
    expect(manual.bindings.map((binding) => [binding.key, binding.pressAction])).toEqual([['Space', 'select'], ['Enter', 'next'], ['Backspace', 'back']]);
    expect(withManualSwitches(manual)).toEqual(manual);
    const backspaceTaken = withManualSwitches({ holdIntervalMs: 1_000, bindings: [{ id: 'a', name: 'Select', key: 'Backspace', pressAction: 'select', holdActions: [] }] });
    expect(backspaceTaken.bindings.map((binding) => binding.key)).toEqual(['Backspace', 'Enter', 'ArrowLeft']);
  });
});
