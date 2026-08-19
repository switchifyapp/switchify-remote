import { fireEvent, render } from '@testing-library/react-native';
import { SegmentedTabs } from './SegmentedTabs';

it('exposes a selected tab and changes selection through its callback', async () => {
  const select = jest.fn();
  const view = await render(<SegmentedTabs items={[{ key: 'mouse', label: 'Mouse' }, { key: 'typing', label: 'Typing' }]} selectedKey="mouse" onSelect={select} />);
  expect(view.getByRole('tab', { name: 'Mouse', selected: true })).toBeTruthy();
  fireEvent.press(view.getByRole('tab', { name: 'Typing' }));
  expect(select).toHaveBeenCalledWith('typing');
});
