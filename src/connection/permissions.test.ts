import { bluetoothPermissionRecoveryMessage, bluetoothPromptMessage, bluetoothUnsupportedMessage } from './permissions';

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

  it('points browsers at site settings', () => {
    expect(bluetoothPermissionRecoveryMessage('web')).toBe(
      'Allow Bluetooth for this site in your browser settings, then try again.',
    );
  });
});

describe('Bluetooth guidance by platform', () => {
  it('describes the browser device chooser on the web', () => {
    expect(bluetoothPromptMessage('web')).toBe('Your browser will ask you to choose your PC after you choose Allow Bluetooth.');
    expect(bluetoothPromptMessage('android')).toBe('Your device will show its Bluetooth permission prompt after you choose Allow Bluetooth.');
  });

  it('names supported browsers when Web Bluetooth is missing', () => {
    expect(bluetoothUnsupportedMessage('web')).toContain('Chrome or Edge');
    expect(bluetoothUnsupportedMessage('ios')).toBe('This device cannot use the Bluetooth features required by Switchify Remote.');
  });
});
