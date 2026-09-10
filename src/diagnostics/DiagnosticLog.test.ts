import { DiagnosticLog } from './DiagnosticLog';

describe('connection-stage diagnostics', () => {
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
