import type { TextInputProps } from 'react-native';
import type { TypingMode } from '@/storage/PreferencesStore';

export function typingInputSubmission(mode: TypingMode, platform: string): Pick<TextInputProps, 'submitBehavior' | 'blurOnSubmit'> {
  return {
    submitBehavior: mode === 'live' ? 'submit' : 'newline',
    // RN Web 0.21 uses blurOnSubmit to dispatch Enter from multiline inputs.
    // The existing post-submit scheduler restores focus after delivery finishes.
    ...(platform === 'web' ? { blurOnSubmit: mode === 'live' } : {}),
  };
}
