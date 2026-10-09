/** @jest-environment jsdom */
/* global describe, it, expect */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.node';
import Pressable from 'react-native-web/dist/cjs/exports/Pressable';
import { webControlAccessibility } from './webControlAccessibility';

function render(props) {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(createElement(Pressable, {
    accessibilityRole: 'button', accessibilityLabel: 'Surface',
    disabled: props.disabled,
    ...webControlAccessibility('web', props),
  }));
  return host.querySelector('button');
}

describe('browser control accessibility', () => {
  it('includes the complete current value in the accessible name', () => {
    const button = render({ label: 'Surface', value: 'Typing', expanded: true });
    expect(button.getAttribute('aria-label')).toBe('Surface: Typing');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.hasAttribute('aria-pressed')).toBe(false);
  });
  it.each([true, false])('exposes toggle state %s and disabled/busy state', (selected) => {
    const button = render({ selected, disabled: true, busy: true });
    expect(button.getAttribute('aria-pressed')).toBe(String(selected));
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.hasAttribute('aria-selected')).toBe(false);
  });
  it.each(['android', 'ios'])('does not override native props on %s', (platform) => {
    expect(webControlAccessibility(platform, { label: 'Surface', value: 'Mouse', selected: true })).toEqual({});
  });
});
