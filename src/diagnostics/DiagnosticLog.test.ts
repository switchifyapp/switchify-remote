import { DiagnosticLog } from './DiagnosticLog';

describe('connection-stage diagnostics', () => {
  it('correlates attempts with anonymous PCs without exporting identifying input', () => {
    const log = new DiagnosticLog();
    const first = log.beginAttempt('private-desktop-id', 'saved');
    const second = log.beginAttempt('another-private-id', 'preferred');
    const third = log.beginAttempt('private-desktop-id', 'switch');
    expect(first.pc).toBe(third.pc);
    expect(second.pc).not.toBe(first.pc);
    log.addConnectionStage('resolution', 'started', first);
    log.peerObserved('another-private-id', true, first);
    log.add('teardown_native', 'warning', third);
    expect(log.export()).toContain('[attempt-1 PC-1 saved]');
    expect(log.export()).toContain('Observed PC-2; replies=read-v1');
    expect(log.export()).toContain('[attempt-3 PC-1 switch]');
    expect(log.export()).not.toMatch(/private|desktop-id/);
  });

  it('bounds aliases, clears correlation state, and isolates throwing observers', () => {
    const log = new DiagnosticLog();
    log.subscribe(() => { throw new Error('private observer error'); });
    const first = log.beginAttempt('first-private-id', 'saved');
    for (let n = 0; n < 130; n++) log.beginAttempt(`private-${n}`, 'nearby');
    expect(log.beginAttempt('first-private-id', 'saved').pc).not.toBe(first.pc);
    log.clear();
    expect(log.export()).toBe('');
    log.add('connected', 'info', first);
    expect(log.export()).not.toContain('attempt-1');
    expect(log.export()).not.toContain('private');
  });
  it('uses the existing bounded, observable and clearable local log', () => {
    const log = new DiagnosticLog();
    const listener = jest.fn();
    const remove = log.subscribe(listener);
    for (let index = 0; index < 205; index++) log.addConnectionStage('connect', 'started');
    expect(log.snapshot()).toHaveLength(200);
    expect(listener).toHaveBeenCalledTimes(205);
    expect(log.export()).toContain('ble_connect_started: Connect to the selected PC: started.');
    log.addConnectionStage('notification_ready', 'failed');
    expect(log.snapshot()[0]).toMatchObject({ level: 'warning', code: 'ble_notification_ready_failed' });
    log.clear();
    expect(log.export()).toBe('');
    remove();
  });
});
