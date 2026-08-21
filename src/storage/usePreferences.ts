import { useEffect, useSyncExternalStore } from 'react';
import { preferencesStore } from './PreferencesStore';

export function usePreferences() {
  useEffect(() => { void preferencesStore.load(); }, []);
  return useSyncExternalStore(preferencesStore.subscribe, preferencesStore.snapshot, preferencesStore.snapshot);
}
