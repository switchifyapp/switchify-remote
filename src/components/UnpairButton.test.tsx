import { fireEvent, render } from '@testing-library/react-native';
import { Alert, type AlertButton, type AlertOptions } from 'react-native';

import { UnpairButton } from './UnpairButton';

describe('UnpairButton', () => {
  afterEach(() => jest.restoreAllMocks());

  it('asks before unpairing and keeps the complete computer name', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const displayName = 'Office Mac with a deliberately long localized computer name';
    const view = await render(<UnpairButton displayName={displayName} onConfirm={() => undefined} />);

    fireEvent.press(view.getByRole('button', { name: `Unpair ${displayName}` }));

    expect(alert).toHaveBeenCalledWith(
      `Unpair ${displayName}?`,
      "This removes saved access from this device. You'll need to pair with this computer again.",
      expect.any(Array),
      { cancelable: true },
    );
  });

  it('does nothing when the user cancels or dismisses the alert', async () => {
    const onConfirm = jest.fn();
    let buttons: AlertButton[] = [];
    let options: AlertOptions | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, nextButtons, nextOptions) => {
      buttons = nextButtons ?? [];
      options = nextOptions;
    });
    const view = await render(<UnpairButton displayName="Office PC" onConfirm={onConfirm} />);

    fireEvent.press(view.getByRole('button', { name: 'Unpair Office PC' }));
    buttons[0]?.onPress?.();
    options?.onDismiss?.();

    expect(buttons[0]).toMatchObject({ text: 'Cancel', style: 'cancel' });
    expect(options?.cancelable).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('uses one destructive confirmation action', async () => {
    const onConfirm = jest.fn();
    let buttons: AlertButton[] = [];
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, nextButtons) => {
      buttons = nextButtons ?? [];
    });
    const view = await render(<UnpairButton displayName="Office PC" onConfirm={onConfirm} />);

    fireEvent.press(view.getByRole('button', { name: 'Unpair Office PC' }));
    expect(buttons[1]).toMatchObject({ text: 'Unpair', style: 'destructive' });
    buttons[1]?.onPress?.();

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
