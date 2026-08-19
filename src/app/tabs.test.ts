import { tabDefinitions } from './tabDefinitions';

it('keeps diagnostics out of the primary tab bar', () => {
  expect(tabDefinitions.map((tab) => tab.name)).toEqual(['index', 'remote', 'settings']);
});
