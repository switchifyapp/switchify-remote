import type { TextInput } from 'react-native';

export function scheduleLiveTextInputFocus(resolveInput: () => TextInput | null): () => void {
  let cancelled = false;
  let frame: number | null = null;

  const schedule = (callback: () => void) => {
    frame = requestAnimationFrame(() => {
      frame = null;
      if (!cancelled) callback();
    });
  };
  const focus = () => {
    try { resolveInput()?.focus(); } catch { /* The native input may have unmounted. */ }
  };

  schedule(() => {
    let input: TextInput | null;
    try { input = resolveInput(); } catch { return; }
    if (input === null) return;
    try {
      if (input.isFocused()) {
        input.blur();
        schedule(focus);
        return;
      }
      input.focus();
    } catch {
      // Native focus state can change while React Native applies editable.
    }
  });

  return () => {
    cancelled = true;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
}
