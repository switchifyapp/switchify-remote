import { desktopDisplayName } from './desktopDisplayName';

describe('desktopDisplayName', () => {
  it('prefers the Bluetooth device name for Windows', () => {
    expect(desktopDisplayName(
      { desktopId: 'pc-1', displayName: 'Switchify PC', platform: 'windows' },
      '  Oliver Laptop  ',
    )).toBe('Oliver Laptop');
  });

  it('prefers the status display name for macOS', () => {
    expect(desktopDisplayName(
      { desktopId: 'pc-1', displayName: 'Owen’s Mac Studio', platform: 'macos' },
      'Mac',
    )).toBe('Owen’s Mac Studio');
  });

  it.each([
    [null, 'Office PC'],
    ['   ', 'Office PC'],
  ])('falls back from a missing Windows Bluetooth name', (bluetoothName, expected) => {
    expect(desktopDisplayName(
      { desktopId: 'pc-1', displayName: 'Office PC', platform: 'windows' },
      bluetoothName,
    )).toBe(expected);
  });
});
