import { diagnosticsScreenOptions } from '@/navigation/diagnosticsScreenOptions';

describe('root navigation', () => {
  it('labels the native Diagnostics back control as Settings', () => {
    expect(diagnosticsScreenOptions).toMatchObject({
      headerBackTitle: 'Settings',
      headerShown: true,
      title: 'Diagnostics',
    });
    expect(Object.values(diagnosticsScreenOptions)).not.toContain('(tabs)');
  });
});
