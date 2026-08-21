import { deviceModelRemoteName, FALLBACK_REMOTE_NAME, resolveRemoteName, validateRemoteName } from './remoteName';

describe('Remote device names', () => {
  it('uses a valid model name without reading a personal system name', () => {
    expect(deviceModelRemoteName(' OPD2403 ')).toBe('OPD2403');
    expect(resolveRemoteName(null, 'iPhone 17 Pro')).toBe('iPhone 17 Pro');
  });

  it('falls back when the model is absent or unusable', () => {
    expect(deviceModelRemoteName(null)).toBe(FALLBACK_REMOTE_NAME);
    expect(deviceModelRemoteName('\n')).toBe(FALLBACK_REMOTE_NAME);
    expect(deviceModelRemoteName('x'.repeat(41))).toBe(FALLBACK_REMOTE_NAME);
  });

  it('trims names and accepts international text and emoji', () => {
    expect(validateRemoteName('  Owen’s Phone 📱  ')).toEqual({ valid: true, value: 'Owen’s Phone 📱' });
  });

  it('rejects empty, overlong, and control-character names', () => {
    expect(validateRemoteName('   ')).toMatchObject({ valid: false });
    expect(validateRemoteName('a'.repeat(41))).toMatchObject({ valid: false });
    expect(validateRemoteName('Phone\nSecond line')).toMatchObject({ valid: false });
    expect(validateRemoteName(`Phone${String.fromCharCode(127)}`)).toMatchObject({ valid: false });
  });
});
