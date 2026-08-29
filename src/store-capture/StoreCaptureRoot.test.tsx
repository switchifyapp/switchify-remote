import { render } from '@testing-library/react-native';

import { StoreCaptureRoot, storeCaptureEnabled, storeCaptureShot } from './StoreCaptureRoot';

describe('store capture mode', () => {
  it.each([[undefined, false], ['', false], ['0', false], ['true', false], ['1', true]] as const)('requires the exact local build flag %p', (value, expected) => {
    expect(storeCaptureEnabled(value)).toBe(expected);
  });

  it('accepts only sanitized capture deep links', () => {
    expect(storeCaptureShot('switchify-remote://capture/mouse')).toBe('mouse');
    expect(storeCaptureShot('switchify-remote://capture/access?fixture=1')).toBe('access');
    expect(storeCaptureShot('https://example.com/capture/mouse')).toBeNull();
    expect(storeCaptureShot('switchify-remote://capture/diagnostics')).toBeNull();
  });

  it('renders a sanitized fixture without a Bluetooth provider', async () => {
    const view = await render(<StoreCaptureRoot />);
    expect(view.getByTestId('store-capture-pair')).toBeTruthy();
    expect(view.getByText('Demo PC')).toBeTruthy();
    expect(view.queryByText(/verification code/i)).toBeNull();
  });
});
