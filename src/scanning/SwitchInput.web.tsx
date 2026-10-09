import { ACTION_LABELS, type SwitchSettings } from '@switchify/scanning';
import { useKeyboardSwitches } from '@switchify/scanning/dom';
import { useScanSnapshot } from '@switchify/scanning/native';
import { Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';
import { useKeyCaptureActive } from './keyCapture';
import { runScanInterrupts } from './scanInterrupts';

export const switchInputSupported = true;

function statusMessage(snapshot: ReturnType<typeof useScanSnapshot>, holdAction: string | undefined): string | null {
  if (holdAction) return `Release for ${holdAction.toLowerCase()}`;
  if (!snapshot.active) return null;
  if (snapshot.paused) return 'Scanning paused. Use Pause to resume.';
  if (snapshot.waiting || snapshot.suspended) return 'Press Select to continue scanning.';
  return null;
}

/** Reads keyboard-style switches and shows hold prompts and pauses at the bottom of the screen. */
export function SwitchInput({ settings }: { settings: SwitchSettings }) {
  const { colors, radii, spacing, typography } = useTheme();
  const snapshot = useScanSnapshot();
  const capturing = useKeyCaptureActive();
  const { prompt } = useKeyboardSwitches({ settings, enabled: !capturing, interceptPress: runScanInterrupts });
  const message = statusMessage(snapshot, prompt ? ACTION_LABELS[prompt.action] : undefined);
  return <View accessibilityLiveRegion="polite" pointerEvents="none" style={{ alignItems: 'center', bottom: spacing.xxxl * 3, left: 0, position: 'absolute', right: 0 }}>
    {message ? <View testID="scan-status" style={{ backgroundColor: colors.text, borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
      <Text accessibilityRole="text" style={[typography.label, { color: colors.background }]}>{message}</Text>
    </View> : null}
  </View>;
}
