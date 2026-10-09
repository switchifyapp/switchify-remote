import { revealPlan } from './useScannable';

const area = { top: 100, bottom: 700 };

describe('revealing the highlighted control', () => {
  it('leaves the page still while the control is fully visible', () => {
    expect(revealPlan({ top: 200, bottom: 260 }, area)).toBeNull();
    expect(revealPlan({ top: 112, bottom: 688 }, area)).toBeNull();
  });

  it('centres a control that is hidden or touching an edge', () => {
    expect(revealPlan({ top: 690, bottom: 750 }, area)).toBe('center');
    expect(revealPlan({ top: 40, bottom: 100 }, area)).toBe('center');
    expect(revealPlan({ top: 1200, bottom: 1260 }, area)).toBe('center');
  });

  it('aligns a section too tall to centre with the top', () => {
    expect(revealPlan({ top: 650, bottom: 1300 }, area)).toBe('start');
  });
});
