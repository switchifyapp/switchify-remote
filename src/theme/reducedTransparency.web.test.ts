/** @jest-environment jsdom */
import { subscribeReducedTransparency } from './reducedTransparency.web';

describe('web reduced transparency', () => {
  it('follows the prefers-reduced-transparency media query until unsubscribed', () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const query = {
      matches: true,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    };
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: jest.fn(() => query) });
    const onChange = jest.fn();
    const unsubscribe = subscribeReducedTransparency(onChange);
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-transparency: reduce)');
    expect(onChange).toHaveBeenLastCalledWith(true);
    listeners.forEach((listener) => listener({ matches: false } as MediaQueryListEvent));
    expect(onChange).toHaveBeenLastCalledWith(false);
    unsubscribe();
    expect(listeners.size).toBe(0);
  });
});
