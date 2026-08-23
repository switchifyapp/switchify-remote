import { desktopDisplayName } from './desktopDisplayName';

describe('desktopDisplayName', () => {
  it('prefers the Bluetooth device name for Windows', () => {
    expect(desktopDisplayName(
      { desktopId: 'pc-1', displayName: 'Switchify PC', platform: 'windows' },
      { name: '  Oliver Laptop  ', localName: 'Switchify PC' },
      'android',
    )).toBe('Oliver Laptop');
  });

  it('prefers the advertised local name for Windows on iOS', () => {
    expect(desktopDisplayName(
      { desktopId: 'pc-1', displayName: 'Switchify PC', platform: 'windows' },
      { name: 'Cached Windows Name', localName: '  Owen’s Windows PC  ' },
      'ios',
    )).toBe('Owen’s Windows PC');
  });

  it('preserves Android device-name precedence', () => {
    expect(desktopDisplayName(
      { desktopId: 'pc-1', displayName: 'Status Name', platform: 'windows' },
      { name: 'Android Device Name', localName: 'Advertisement Name' },
      'android',
    )).toBe('Android Device Name');
  });

  it('uses the advertised local name as an Android fallback', () => {
    expect(desktopDisplayName(
      { desktopId: 'pc-1', displayName: 'Switchify PC', platform: 'windows' },
      { name: null, localName: 'Windows Local Name' },
      'android',
    )).toBe('Windows Local Name');
  });

  it('prefers the status display name for macOS', () => {
    expect(desktopDisplayName(
      { desktopId: 'pc-1', displayName: 'Owen’s Mac Studio', platform: 'macos' },
      { name: 'Mac', localName: 'Switchify PC' },
      'ios',
    )).toBe('Owen’s Mac Studio');
  });

  it.each([
    [{ name: null, localName: null }, 'Office PC'],
    [{ name: '   ', localName: '   ' }, 'Office PC'],
    [{ name: 'Switchify PC', localName: 'SWITCHIFY PC' }, 'Office PC'],
  ])('falls back from missing or generic Windows Bluetooth names', (bluetooth, expected) => {
    expect(desktopDisplayName(
      { desktopId: 'pc-1', displayName: 'Office PC', platform: 'windows' },
      bluetooth,
      'ios',
    )).toBe(expected);
  });

  it('uses a Unicode local name when the iOS device name is unavailable', () => {
    expect(desktopDisplayName(
      { desktopId: 'pc-1', displayName: 'Switchify PC', platform: 'windows' },
      { name: null, localName: '  Büro-PC 日本語  ' },
      'ios',
    )).toBe('Büro-PC 日本語');
  });
});
