import { useEffect, useSyncExternalStore } from 'react';
import { preferencesStore } from './PreferencesStore';

let loaded = false;

export function usePreferences() {
  useEffect(() => { if (!loaded) { loaded = true; void preferencesStore.load(); } }, []);
  return useSyncExternalStore(preferencesStore.subscribe, preferencesStore.snapshot, preferencesStore.snapshot);
}
