import * as Device from 'expo-device';

export const FALLBACK_REMOTE_NAME = 'Switchify Remote';
export const MAX_REMOTE_NAME_CHARACTERS = 40;

export type RemoteNameValidation =
  | { valid: true; value: string }
  | { valid: false; error: string };

export function validateRemoteName(value: string): RemoteNameValidation {
  const trimmed = value.trim();
  if (!trimmed) return { valid: false, error: 'Enter a name.' };
  if (/\p{Cc}/u.test(trimmed)) return { valid: false, error: 'The name cannot contain line breaks or control characters.' };
  if ([...trimmed].length > MAX_REMOTE_NAME_CHARACTERS) return { valid: false, error: `Use ${MAX_REMOTE_NAME_CHARACTERS} characters or fewer.` };
  return { valid: true, value: trimmed };
}

export function deviceModelRemoteName(modelName: string | null = Device.modelName): string {
  const validated = validateRemoteName(modelName ?? '');
  return validated.valid ? validated.value : FALLBACK_REMOTE_NAME;
}

export function resolveRemoteName(savedName: string | null, modelName: string | null = Device.modelName): string {
  if (savedName !== null) {
    const validated = validateRemoteName(savedName);
    if (validated.valid) return validated.value;
  }
  return deviceModelRemoteName(modelName);
}
