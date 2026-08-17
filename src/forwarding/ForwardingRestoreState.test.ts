import { ForwardingRestoreState, shouldClearForwardingRestore } from './ForwardingSurface';

describe('ForwardingRestoreState', () => {
  it('keeps exact desktop and profile identity until explicitly cleared', () => {
    const restore = new ForwardingRestoreState();
    const intent = { desktopId: 'desktop', profileId: 'profile', profileVersion: 2 };
    restore.set(intent);
    expect(restore.get()).toEqual(intent);
    restore.clear();
    expect(restore.get()).toBeNull();
  });

  it('preserves intent only through an unexpected reconnect while forwarding remains selected', () => {
    expect(shouldClearForwardingRestore('forwarding', 'reconnecting')).toBe(false);
    expect(shouldClearForwardingRestore('forwarding', 'connected')).toBe(false);
    expect(shouldClearForwardingRestore('mouse', 'connected')).toBe(true);
    expect(shouldClearForwardingRestore('forwarding', 'failed')).toBe(true);
    expect(shouldClearForwardingRestore('forwarding', 'idle')).toBe(true);
  });
});
