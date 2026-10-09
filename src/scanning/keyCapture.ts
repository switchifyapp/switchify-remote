import { useSyncExternalStore } from 'react';

let capturing = false;
const listeners = new Set<() => void>();

function set(value: boolean): void {
  if (capturing === value) return;
  capturing = value;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => capturing;

/** True while Settings waits for a switch press to assign a key; switches then pause. */
export function useKeyCaptureActive(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * Waits for the next key press and reports its code, so a switch can be assigned by
 * pressing it. Escape cancels. Keys are kept from the page until the pressed key is
 * released, so that release cannot click whatever has focus. Returns a function that
 * stops waiting.
 */
export function captureNextKey(onKey: (code: string | null) => void): () => void {
  if (typeof window === 'undefined') { onKey(null); return () => undefined; }
  set(true);
  let pressed: string | null = null;
  let closed = false;
  const swallow = (event: KeyboardEvent) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    set(false);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    swallow(event);
    if (pressed !== null || event.repeat) return;
    pressed = event.code;
    onKey(event.code === 'Escape' ? null : event.code);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    swallow(event);
    if (pressed !== null && event.code === pressed) close();
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  return () => {
    if (pressed === null) onKey(null);
    close();
  };
}
