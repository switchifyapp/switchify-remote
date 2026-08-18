const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, describe, expect, test } = require('@jest/globals');

const {
  bumpVersion,
  parseReleaseVersion,
  validateHistoricalBuild,
  validateVersionState,
} = require('./versioning.cjs');

function state(overrides = {}) {
  const releaseVersion = overrides.releaseVersion ?? '0.1.0-alpha.1';
  const marketingVersion = overrides.marketingVersion ?? '0.1.0';
  const androidBuild = overrides.androidBuild ?? 1;
  const iosBuild = overrides.iosBuild ?? '1';
  const lockVersion = overrides.lockVersion ?? releaseVersion;
  return {
    packageJson: { name: 'switchify-remote', version: releaseVersion },
    packageLock: {
      name: 'switchify-remote',
      version: lockVersion,
      lockfileVersion: 3,
      packages: { '': { name: 'switchify-remote', version: lockVersion } },
    },
    appJson: {
      expo: {
        version: marketingVersion,
        android: { versionCode: androidBuild },
        ios: { buildNumber: iosBuild },
      },
    },
  };
}

describe('version validation', () => {
  test.each([
    ['0.1.0-alpha.1', 'alpha'],
    ['0.1.0-beta.2', 'beta'],
    ['0.1.0-rc.3', 'rc'],
    ['1.0.0', null],
  ])('accepts %s', (version, stage) => {
    expect(parseReleaseVersion(version).stage).toBe(stage);
  });

  test.each(['1.0', '01.0.0', '1.0.0-preview.1', '1.0.0-alpha.0', '1.0.0+5'])(
    'rejects malformed release version %s',
    (version) => expect(() => parseReleaseVersion(version)).toThrow(),
  );

  test('rejects a marketing-version mismatch', () => {
    expect(() => validateVersionState(state({ marketingVersion: '0.2.0' }))).toThrow(
      'numeric core',
    );
  });

  test('rejects package-lock drift', () => {
    expect(() => validateVersionState(state({ lockVersion: '0.1.0-alpha.2' }))).toThrow(
      'Package lock',
    );
  });

  test('rejects unequal platform build numbers', () => {
    expect(() => validateVersionState(state({ iosBuild: '2' }))).toThrow('must match');
  });

  test.each([
    { androidBuild: 0 },
    { iosBuild: '0' },
    { iosBuild: '1.1' },
  ])('rejects non-positive or non-integral build numbers', (overrides) => {
    expect(() => validateVersionState(state(overrides))).toThrow('positive integer');
  });
});

describe('version bump', () => {
  let directory;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'switchify-version-'));
    const fixture = state();
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(fixture.packageJson));
    fs.writeFileSync(path.join(directory, 'package-lock.json'), JSON.stringify(fixture.packageLock));
    fs.writeFileSync(path.join(directory, 'app.json'), JSON.stringify(fixture.appJson));
  });

  afterEach(() => fs.rmSync(directory, { force: true, recursive: true }));

  test.each([
    ['0.1.0-alpha.2', '0.1.0'],
    ['0.1.0', '0.1.0'],
  ])('updates %s and increments both platform builds', (nextVersion, marketingVersion) => {
    expect(bumpVersion(directory, nextVersion)).toEqual({
      buildNumber: 2,
      marketingVersion,
      releaseVersion: nextVersion,
    });
    expect(validateVersionState({
      appJson: JSON.parse(fs.readFileSync(path.join(directory, 'app.json'))),
      packageJson: JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))),
      packageLock: JSON.parse(fs.readFileSync(path.join(directory, 'package-lock.json'))),
    }).buildNumber).toBe(2);
  });

  test('rejects an unchanged or decreasing release version', () => {
    expect(() => bumpVersion(directory, '0.1.0-alpha.1')).toThrow('must be greater');
  });
});

describe('release build history', () => {
  const historicalConfig = (androidBuild, iosBuild) => ({
    expo: {
      android: { versionCode: androidBuild },
      ios: iosBuild === undefined ? {} : { buildNumber: String(iosBuild) },
    },
  });

  test('accepts a build above legacy and cross-platform releases', () => {
    expect(
      validateHistoricalBuild(6, [historicalConfig(4), historicalConfig(5, 5)]),
    ).toBe(5);
  });

  test.each([5, 4])('rejects duplicate or decreasing build %s', (currentBuild) => {
    expect(() =>
      validateHistoricalBuild(currentBuild, [historicalConfig(4), historicalConfig(5, 5)]),
    ).toThrow('previous maximum 5');
  });
});
