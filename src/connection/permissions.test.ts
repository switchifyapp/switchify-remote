import { bluetoothPermissionRecoveryMessage } from './permissions';

describe('bluetoothPermissionRecoveryMessage', () => {
  it('uses iOS Bluetooth Settings guidance', () => {
    expect(bluetoothPermissionRecoveryMessage('ios')).toBe(
      'Allow Bluetooth in Settings, then try again.',
    );
  });

  it('keeps Android nearby-device guidance', () => {
    expect(bluetoothPermissionRecoveryMessage('android')).toBe(
      'Allow Bluetooth and nearby-device access in system settings, then try again.',
    );
  });
});
