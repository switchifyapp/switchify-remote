/** @jest-environment jsdom */
/* global describe, beforeEach, afterEach, it, jest, expect */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import TextInput from 'react-native-web/dist/cjs/exports/TextInput';

import { typingInputSubmission } from './typingInputSubmission';

describe('browser typing submission with the installed React Native Web input', () => {
  let host;
  let root;
  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it.each(['live', 'draft'])('handles keyboard Enter in %s mode', async (mode) => {
    const submit = jest.fn();
    await act(async () => root.render(createElement(TextInput, {
      multiline: true,
      ...typingInputSubmission(mode, 'web'),
      onSubmitEditing: submit,
    })));
    const input = host.querySelector('textarea');
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(async () => input.dispatchEvent(event));
    expect(submit).toHaveBeenCalledTimes(mode === 'live' ? 1 : 0);
    expect(event.defaultPrevented).toBe(mode === 'live');
  });

  it('does not submit while an IME composition is active', async () => {
    const submit = jest.fn();
    await act(async () => root.render(createElement(TextInput, {
      multiline: true, ...typingInputSubmission('live', 'web'), onSubmitEditing: submit,
    })));
    await act(async () => host.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', isComposing: true, bubbles: true, cancelable: true,
    })));
    expect(submit).not.toHaveBeenCalled();
  });

  it.each(['android', 'ios'])('preserves native submission props on %s', (platform) => {
    expect(typingInputSubmission('live', platform)).toEqual({ submitBehavior: 'submit' });
    expect(typingInputSubmission('draft', platform)).toEqual({ submitBehavior: 'newline' });
  });
});
