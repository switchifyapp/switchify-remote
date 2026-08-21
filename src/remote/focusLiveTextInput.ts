import type { TextInput } from 'react-native';

export function focusLiveTextInput(input: TextInput | null): void {
  input?.focus();
}
