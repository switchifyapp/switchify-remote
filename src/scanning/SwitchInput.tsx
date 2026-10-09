import type { SwitchSettings } from '@switchify/scanning';

/** Native React Native has no global key events, so switches are read on the web only. */
export const switchInputSupported = false;

export function SwitchInput(_props: { settings: SwitchSettings }) {
  return null;
}
