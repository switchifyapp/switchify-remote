import { AccessibilityInfo, Alert } from 'react-native';

const REGION_ID = 'switchify-live-region';
let installed = false;

function liveRegion(): HTMLElement | null {
  if (typeof document === 'undefined' || !document.body) return null;
  const existing = document.getElementById(REGION_ID);
  if (existing) return existing;
  const region = document.createElement('div');
  region.id = REGION_ID;
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'true');
  Object.assign(region.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: '0',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: '0',
  });
  document.body.appendChild(region);
  return region;
}

let pending: string[] = [];
let flushing = false;

function announce(message: string): void {
  if (!message) return;
  pending.push(message);
  if (flushing) return;
  flushing = true;
  const next = () => {
    const region = liveRegion();
    const value = pending.shift();
    if (!region || value === undefined) {
      pending = [];
      flushing = false;
      return;
    }
    // Clearing first makes screen readers repeat an identical message.
    region.textContent = '';
    setTimeout(() => {
      region.textContent = value;
      setTimeout(next, 500);
    }, 50);
  };
  next();
}

/**
 * React Native Web's Alert does nothing. The app's alerts are either notices or a
 * cancel plus one action, which map onto the browser's own accessible dialogs.
 */
const alert: typeof Alert.alert = (title, message, buttons) => {
  if (typeof window === 'undefined') return;
  const text = message ? `${title}\n\n${message}` : title;
  const choices = buttons ?? [];
  if (choices.length <= 1) {
    window.alert(text);
    choices[0]?.onPress?.();
    return;
  }
  const cancel = choices.find((button) => button.style === 'cancel') ?? choices[0];
  const action = choices.find((button) => button !== cancel);
  // Browser dialogs only offer OK and Cancel, so the action is named in the text.
  const prompt = action?.text ? `${text}\n\nChoose OK to ${action.text.toLowerCase()}.` : text;
  if (window.confirm(prompt)) action?.onPress?.();
  else cancel?.onPress?.();
};

/** React Native Web leaves alerts, screen-reader announcements and focus moves as no-ops; route them to the DOM. */
export function installPlatform(): void {
  if (installed) return;
  installed = true;
  Alert.alert = alert;
  const info = AccessibilityInfo as typeof AccessibilityInfo & {
    announceForAccessibilityWithOptions?: (message: string, options: { queue?: boolean }) => void;
  };
  info.announceForAccessibility = announce;
  info.announceForAccessibilityWithOptions = (message) => announce(message);
  // Some screen readers ignore a live region that appears just before its first update.
  if (typeof document !== 'undefined') {
    if (document.body) liveRegion();
    else document.addEventListener('DOMContentLoaded', () => liveRegion(), { once: true });
  }
}
