import { profilePresentation, profileStatusAnnouncement } from './profilePresentation';

describe('pointer profile presentation', () => {
  it('distinguishes recovery, restored, and exhausted states', () => {
    expect(profilePresentation('recovering')).toMatchObject({ title: 'Restoring controls' });
    expect(profilePresentation('ready')).toMatchObject({ title: 'Controls restored' });
    expect(profilePresentation('unavailable')).toMatchObject({ title: 'Controls unavailable' });
  });

  it('announces recovery transitions once without announcing ordinary ready connections', () => {
    expect(profileStatusAnnouncement('ready', null)).toBeNull();
    expect(profileStatusAnnouncement('recovering', 'ready')).toBe('Restoring controls.');
    expect(profileStatusAnnouncement('ready', 'recovering')).toBe('Controls restored.');
    expect(profileStatusAnnouncement('unavailable', 'recovering')).toBe('Controls unavailable.');
  });
});
