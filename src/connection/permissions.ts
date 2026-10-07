import { PermissionsAndroid, Platform } from 'react-native';

export async function requestBluetoothPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (Platform.Version >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED && result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
  }
  return await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION) === PermissionsAndroid.RESULTS.GRANTED;
}

export function bluetoothPermissionRecoveryMessage(platform: typeof Platform.OS = Platform.OS): string {
  if (platform === 'web') return 'Allow Bluetooth for this site in your browser settings, then try again.';
  return platform === 'ios'
    ? 'Allow Bluetooth in Settings, then try again.'
    : 'Allow Bluetooth and nearby-device access in system settings, then try again.';
}

export function bluetoothPromptMessage(platform: typeof Platform.OS = Platform.OS): string {
  return platform === 'web'
    ? 'Your browser will ask you to choose your PC after you choose Allow Bluetooth.'
    : 'Your device will show its Bluetooth permission prompt after you choose Allow Bluetooth.';
}

export function bluetoothUnsupportedMessage(platform: typeof Platform.OS = Platform.OS): string {
  return platform === 'web'
    ? 'This browser cannot use Bluetooth. Open Switchify Remote in Chrome or Edge on Android, Windows, macOS or ChromeOS.'
    : 'This device cannot use the Bluetooth features required by Switchify Remote.';
}
