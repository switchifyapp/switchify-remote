import { createContext } from 'react';

/** Scanning is switched on and this platform can read switches. */
export const ScanningEnabledContext = createContext(false);

/**
 * False inside screens that are mounted but not shown, such as inactive tabs, so
 * their controls never join the scan.
 */
export const ScanVisibleContext = createContext(true);
