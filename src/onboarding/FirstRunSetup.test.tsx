import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Linking, StyleSheet } from 'react-native';
import { FirstRunSetup, SWITCHIFY_PC_RELEASES_URL } from './FirstRunSetup';
import { FirstRunSetupStore } from './FirstRunSetupStore';

const mockAnnouncement = jest.fn();
jest.mock('@/components/useAccessibilityAnnouncement', () => ({
  useAccessibilityAnnouncement: (message: string | null) =>
    mockAnnouncement(message),
}));
function storage() {
  return {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  };
}

async function storeAt(phase: 'welcome' | 'bluetooth') {
  const persistence = storage();
  const store = new FirstRunSetupStore(persistence);
  await store.load();
  if (phase === 'bluetooth') store.showBluetooth();
  return { persistence, store };
}

describe('FirstRunSetup', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockAnnouncement.mockClear();
  });

  it('explains the product and desktop prerequisite before mentioning a permission action', async () => {
    const { store } = await storeAt('welcome');
    const view = await render(
      <FirstRunSetup
        manager={{ scan: jest.fn() }}
        phase="welcome"
        store={store}
      />,
    );

    expect(
      view.getByRole('header', { name: 'Meet Switchify Remote' }),
    ).toBeTruthy();
    expect(view.getByText('Step 1 of 2')).toBeTruthy();
    expect(
      view.getByText(
        'Use your phone or tablet as an accessible remote for a Windows PC or Mac.',
      ),
    ).toBeTruthy();
    expect(
      view.getByText(
        'Install and open Switchify PC on the computer you want to control.',
      ),
    ).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Allow Bluetooth' })).toBeNull();
    expect(view.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('opens the desktop download and gives a useful fallback when opening fails', async () => {
    const open = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('private failure'));
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    const { store } = await storeAt('welcome');
    const view = await render(
      <FirstRunSetup
        manager={{ scan: jest.fn() }}
        phase="welcome"
        store={store}
      />,
    );

    fireEvent.press(view.getByRole('button', { name: 'Get Switchify PC' }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(SWITCHIFY_PC_RELEASES_URL),
    );
    fireEvent.press(view.getByRole('button', { name: 'Get Switchify PC' }));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        'Unable to open Switchify PC downloads',
        `Open ${SWITCHIFY_PC_RELEASES_URL} in your browser.`,
      ),
    );
  });

  it('moves forward without persisting or scanning', async () => {
    const scan = jest.fn();
    const first = await storeAt('welcome');
    const welcome = await render(
      <FirstRunSetup manager={{ scan }} phase="welcome" store={first.store} />,
    );
    fireEvent.press(welcome.getByRole('button', { name: 'Continue' }));
    expect(first.store.snapshot()).toBe('bluetooth');
    expect(first.persistence.setItem).not.toHaveBeenCalled();
    expect(scan).not.toHaveBeenCalled();
  });

  it('completes with Not now without starting Bluetooth', async () => {
    const scan = jest.fn();
    const { persistence, store } = await storeAt('bluetooth');
    const view = await render(
      <FirstRunSetup manager={{ scan }} phase="bluetooth" store={store} />,
    );

    fireEvent.press(view.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(store.snapshot()).toBe('complete'));
    expect(persistence.setItem).toHaveBeenCalledTimes(1);
    expect(scan).not.toHaveBeenCalled();
  });

  it('persists before scanning and ignores duplicate Allow Bluetooth actions', async () => {
    let finishWrite!: () => void;
    const persistence = {
      getItem: jest.fn(async () => null),
      setItem: jest.fn(
        () =>
          new Promise<void>((resolve) => {
            finishWrite = resolve;
          }),
      ),
    };
    const store = new FirstRunSetupStore(persistence);
    await store.load();
    store.showBluetooth();
    const scan = jest.fn(async () => undefined);
    const view = await render(
      <FirstRunSetup manager={{ scan }} phase="bluetooth" store={store} />,
    );

    fireEvent.press(view.getByRole('button', { name: 'Allow Bluetooth' }));
    await waitFor(() =>
      expect(
        view.getByRole('button', { name: 'Allow Bluetooth' }),
      ).toBeDisabled(),
    );
    fireEvent.press(view.getByRole('button', { name: 'Allow Bluetooth' }));
    expect(persistence.setItem).toHaveBeenCalledTimes(1);
    expect(scan).not.toHaveBeenCalled();

    await act(async () => {
      finishWrite();
    });
    await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
  });

  it('keeps setup visible and reports a sanitized persistence failure', async () => {
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    const persistence = storage();
    persistence.setItem.mockRejectedValueOnce(new Error('private path'));
    const store = new FirstRunSetupStore(persistence);
    await store.load();
    store.showBluetooth();
    const scan = jest.fn();
    const view = await render(
      <FirstRunSetup manager={{ scan }} phase="bluetooth" store={store} />,
    );

    await act(async () => {
      fireEvent.press(view.getByRole('button', { name: 'Allow Bluetooth' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(alert).toHaveBeenCalledWith(
      'Setup could not continue',
      'Try again. Your existing Switchify settings and paired PCs are unchanged.',
    );
    expect(
      view.getByRole('button', { name: 'Allow Bluetooth' }),
    ).not.toBeDisabled();
    expect(store.snapshot()).toBe('bluetooth');
    expect(scan).not.toHaveBeenCalled();
    expect(JSON.stringify(view.toJSON())).not.toContain('private path');
  });

  it('announces each step and keeps controls in a logical, accessible order', async () => {
    const { store } = await storeAt('bluetooth');
    const view = await render(
      <FirstRunSetup
        manager={{ scan: jest.fn() }}
        phase="bluetooth"
        store={store}
      />,
    );

    expect(mockAnnouncement).toHaveBeenCalledWith(
      'Step 2 of 2. Connect with Bluetooth.',
    );
    expect(
      view.getByText(
        'Remote commands are not routed through a Switchify account or cloud service.',
      ),
    ).toBeTruthy();
    const buttons = view.getAllByRole('button');
    expect(buttons.map((button) => button.props.accessibilityLabel)).toEqual([
      'Allow Bluetooth',
      'Not now',
      'Back',
    ]);
    buttons.forEach((button) =>
      expect(
        StyleSheet.flatten(button.props.style).minHeight,
      ).toBeGreaterThanOrEqual(48),
    );
    fireEvent.press(view.getByRole('button', { name: 'Back' }));
    expect(store.snapshot()).toBe('welcome');
  });
});
