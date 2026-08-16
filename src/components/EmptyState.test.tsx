import { render } from '@testing-library/react-native';

import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('exposes one concise accessible summary', async () => {
    const view = await render(<EmptyState title="No saved PCs" body="Nearby computers will appear here." />);

    expect(view.getByLabelText('No saved PCs. Nearby computers will appear here.')).toBeTruthy();
  });
});
