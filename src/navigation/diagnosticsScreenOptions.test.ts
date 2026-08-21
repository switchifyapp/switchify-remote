import { diagnosticsScreenOptions } from '@/navigation/diagnosticsScreenOptions';

type DirectoryEntry = {
  isDirectory: () => boolean;
  name: string;
};

const { readdirSync } = jest.requireActual<{
  readdirSync: (
    directory: string,
    options: { withFileTypes: true },
  ) => DirectoryEntry[];
}>('fs');
const { join } = jest.requireActual<{
  join: (...paths: string[]) => string;
}>('path');
declare const process: { cwd: () => string };

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function isTestModule(file: string): boolean {
  return (
    /\.(?:test|spec)\.[jt]sx?$/.test(file) ||
    /(?:^|[\\/])__tests__(?:[\\/]|$)/.test(file)
  );
}

describe('root navigation', () => {
  it('labels the native Diagnostics back control as Settings', () => {
    expect(diagnosticsScreenOptions).toMatchObject({
      headerBackTitle: 'Settings',
      headerShown: true,
      title: 'Diagnostics',
    });
    expect(Object.values(diagnosticsScreenOptions)).not.toContain('(tabs)');
  });

  it('keeps test modules outside the Expo Router app directory', () => {
    const appDirectory = join(process.cwd(), 'src', 'app');
    const routeTestFiles = listFiles(appDirectory).filter(isTestModule);

    expect(routeTestFiles).toEqual([]);
  });

  it('recognizes named tests and modules in __tests__ directories', () => {
    expect(isTestModule(join('src', 'app', 'screen.test.tsx'))).toBe(true);
    expect(isTestModule(join('src', 'app', 'screen.spec.ts'))).toBe(true);
    expect(isTestModule(join('src', 'app', '__tests__', 'screen.tsx'))).toBe(
      true,
    );
    expect(isTestModule(join('src', 'app', 'screen.tsx'))).toBe(false);
  });
});
