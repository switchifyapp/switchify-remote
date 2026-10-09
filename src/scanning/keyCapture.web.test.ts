/** @jest-environment jsdom */
import { captureNextKey } from './keyCapture';

const key = (type: 'keydown' | 'keyup', code: string, repeat = false) => {
  const event = new KeyboardEvent(type, { code, repeat, bubbles: true, cancelable: true });
  window.dispatchEvent(event);
  return event;
};

describe('assigning a switch key', () => {
  it('reports the pressed key and keeps its release from the page', () => {
    const onKey = jest.fn();
    const pageKeyUp = jest.fn();
    window.addEventListener('keyup', pageKeyUp);
    captureNextKey(onKey);
    expect(key('keydown', 'Digit1').defaultPrevented).toBe(true);
    expect(onKey).toHaveBeenCalledWith('Digit1');
    key('keydown', 'Digit1', true);
    expect(onKey).toHaveBeenCalledTimes(1);
    expect(key('keyup', 'Digit1').defaultPrevented).toBe(true);
    expect(pageKeyUp).not.toHaveBeenCalled();
    expect(key('keydown', 'Space').defaultPrevented).toBe(false);
    window.removeEventListener('keyup', pageKeyUp);
  });

  it('treats Escape as cancel', () => {
    const onKey = jest.fn();
    captureNextKey(onKey);
    key('keydown', 'Escape');
    key('keyup', 'Escape');
    expect(onKey).toHaveBeenCalledWith(null);
  });

  it('can be stopped before any key is pressed', () => {
    const onKey = jest.fn();
    const stop = captureNextKey(onKey);
    stop();
    expect(onKey).toHaveBeenCalledWith(null);
    expect(key('keydown', 'Space').defaultPrevented).toBe(false);
  });
});
