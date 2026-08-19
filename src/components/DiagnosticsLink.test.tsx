import { fireEvent, render } from '@testing-library/react-native';
import { DiagnosticsLink } from './DiagnosticsLink';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

it('opens the pushed diagnostics route from Settings', async () => {
  const view = await render(<DiagnosticsLink />);
  fireEvent.press(view.getByRole('button', { name: 'Diagnostics' }));
  expect(mockPush).toHaveBeenCalledWith('/diagnostics');
});
