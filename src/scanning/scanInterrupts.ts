import { useEffect } from 'react';

/** Returns true when it handled the press, which then never becomes a scan action. */
export type ScanInterrupt = () => boolean;

const interrupts = new Set<ScanInterrupt>();

/** Gives every registered interrupt a chance to consume a switch press. */
export function runScanInterrupts(): boolean {
  for (const interrupt of interrupts) if (interrupt()) return true;
  return false;
}

/**
 * Lets a screen claim the next switch press while something is in progress, such
 * as a repeating pointer movement that any press should stop.
 */
export function useScanInterrupt(interrupt: ScanInterrupt): void {
  useEffect(() => {
    interrupts.add(interrupt);
    return () => { interrupts.delete(interrupt); };
  }, [interrupt]);
}
