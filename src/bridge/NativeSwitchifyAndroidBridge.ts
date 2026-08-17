import { requireNativeModule, type EventSubscription, type NativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import type { BridgeEvent, BridgeSnapshot } from './types';

type Events = { onBridgeEvent: (event: BridgeEvent) => void };

export interface NativeSwitchifyAndroidBridge extends NativeModule<Events> {
  connectAsync(): Promise<boolean>;
  disconnectAsync(): Promise<void>;
  snapshotAsync(): Promise<BridgeSnapshot & { type?: string }>;
  setRepeatActiveAsync(generation: number, active: boolean): Promise<boolean>;
  setForwardingActiveAsync(generation: number, active: boolean): Promise<boolean>;
  addListener(eventName: 'onBridgeEvent', listener: (event: BridgeEvent) => void): EventSubscription;
}

export function loadNativeSwitchifyAndroidBridge(): NativeSwitchifyAndroidBridge | null {
  if (Platform.OS !== 'android') return null;
  try {
    return requireNativeModule<NativeSwitchifyAndroidBridge>('SwitchifyAndroidBridge');
  } catch {
    return null;
  }
}
