import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { preferencesStore } from '@/storage/PreferencesStore';
import { SurfaceSelector } from './SurfaceSelector';

describe('SurfaceSelector', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    jest.restoreAllMocks();
  });

  it('offers all Android surfaces and persists the selected key', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const update = jest.spyOn(preferencesStore, 'update').mockResolvedValue();
    const view = await render(<SurfaceSelector selected="mouse" />);
    fireEvent.press(view.getByRole('button', { name: 'Surface' }));
    for (const label of ['Mouse', 'Typing', 'Window', 'Forwarding']) await waitFor(() => expect(view.getByRole('button', { name: label })).toBeTruthy());
    fireEvent.press(view.getByRole('button', { name: 'Window' }));
    expect(update).toHaveBeenCalledWith({ surface: 'window' });
  });

  it('omits Android-only forwarding on iOS', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const view = await render(<SurfaceSelector selected="mouse" />);
    fireEvent.press(view.getByRole('button', { name: 'Surface' }));
    await waitFor(() => expect(view.getByRole('button', { name: 'Window' })).toBeTruthy());
    expect(view.queryByRole('button', { name: 'Forwarding' })).toBeNull();
  });
});
