import type { TextInput } from 'react-native';
import { focusLiveTextInput } from './focusLiveTextInput';

describe('focusLiveTextInput', () => {
  it('focuses an available live input', () => {
    const input = { focus: jest.fn() } as unknown as TextInput;
    focusLiveTextInput(input);
    expect(input.focus).toHaveBeenCalledTimes(1);
  });

  it('is safe after the input unmounts', () => {
    expect(() => focusLiveTextInput(null)).not.toThrow();
  });
});
