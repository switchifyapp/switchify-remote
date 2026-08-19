import { render } from '@testing-library/react-native';

import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('keeps read-only copy out of a focusable summary', async () => {
    const view = await render(<EmptyState title="No saved PCs" body="Nearby computers will appear here." />);

    expect(view.getByRole('header', { name: 'No saved PCs' })).toBeTruthy();
    expect(view.getByText('Nearby computers will appear here.')).toBeTruthy();
    expect(view.queryByLabelText('No saved PCs. Nearby computers will appear here.')).toBeNull();
  });
});
