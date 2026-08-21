import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { RemoteNameEditor } from './RemoteNameEditor';

describe('RemoteNameEditor', () => {
  it('shows the model default and keeps its field and actions accessible', async () => {
    const view = await render(<RemoteNameEditor modelName="OPD2403" remoteName={null} onSave={async () => 'deferred'} />);
    const input = view.getByLabelText('Remote name');
    expect(input.props.value).toBe('OPD2403');
    expect(input.props.accessibilityHint).toBe('The name shown on paired computers');
    expect(StyleSheet.flatten(input.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(view.getByRole('button', { name: 'Save name' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Use device model (OPD2403)' })).toBeDisabled();
  });

  it('saves a trimmed custom name and reports connected synchronization', async () => {
    const onSave = jest.fn(async () => 'synced' as const);
    const view = await render(<RemoteNameEditor modelName="OPD2403" remoteName={null} onSave={onSave} />);
    await act(async () => { fireEvent.changeText(view.getByLabelText('Remote name'), '  Living Room 📱  '); });
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Save name' })); });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Living Room 📱'));
    expect(view.getByText('Saved and updated on the connected computer.')).toBeTruthy();
  });

  it('shows validation without submitting invalid text', async () => {
    const onSave = jest.fn(async () => 'deferred' as const);
    const view = await render(<RemoteNameEditor modelName="OPD2403" remoteName={null} onSave={onSave} />);
    await act(async () => { fireEvent.changeText(view.getByLabelText('Remote name'), 'Phone\nSecond line'); });
    expect(view.getByText('The name cannot contain line breaks or control characters.')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Save name' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('resets a custom name and explains offline deferral', async () => {
    const onSave = jest.fn(async () => 'deferred' as const);
    const view = await render(<RemoteNameEditor modelName="OPD2403" remoteName="Kitchen Remote" onSave={onSave} />);
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Use device model (OPD2403)' })); });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
    expect(view.getByLabelText('Remote name').props.value).toBe('OPD2403');
    expect(view.getByText('Saved. It will update the next time you connect.')).toBeTruthy();
  });

  it('keeps the edited value and sanitizes save failures', async () => {
    const onSave = jest.fn(async () => { throw new Error('private storage path'); });
    const view = await render(<RemoteNameEditor modelName="OPD2403" remoteName={null} onSave={onSave} />);
    await act(async () => { fireEvent.changeText(view.getByLabelText('Remote name'), 'Office Remote'); });
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Save name' })); });
    await waitFor(() => expect(view.getByText('Could not save the Remote name.')).toBeTruthy());
    expect(view.getByLabelText('Remote name').props.value).toBe('Office Remote');
    expect(JSON.stringify(view.toJSON())).not.toContain('private storage path');
  });
});
