import { render } from '@testing-library/react-native';

import { runScanInterrupts, useScanInterrupt, type ScanInterrupt } from './scanInterrupts';

function Claim({ interrupt }: { interrupt: ScanInterrupt }) {
  useScanInterrupt(interrupt);
  return null;
}

describe('scan interrupts', () => {
  it('let a mounted screen consume a press only while it needs to', async () => {
    let repeating = true;
    const stop = jest.fn();
    const interrupt = () => { if (!repeating) return false; repeating = false; stop(); return true; };
    const view = await render(<Claim interrupt={interrupt} />);
    expect(runScanInterrupts()).toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(runScanInterrupts()).toBe(false);
    repeating = true;
    await view.unmount();
    expect(runScanInterrupts()).toBe(false);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
