const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const RELEASE_VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.([1-9]\d*))?$/;
const MARKETING_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const STAGE_ORDER = { alpha: 0, beta: 1, rc: 2 };

function parseReleaseVersion(value) {
  if (typeof value !== 'string') {
    throw new Error('Package version must be a string.');
  }

  const match = RELEASE_VERSION_PATTERN.exec(value);
  if (!match) {
    throw new Error(
      'Package version must use MAJOR.MINOR.PATCH, optionally followed by -alpha.N, -beta.N, or -rc.N.',
    );
  }

  return {
    value,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    marketingVersion: `${match[1]}.${match[2]}.${match[3]}`,
    stage: match[4] ?? null,
    stageNumber: match[5] ? Number(match[5]) : null,
  };
}

function compareReleaseVersions(leftValue, rightValue) {
  const left = parseReleaseVersion(leftValue);
  const right = parseReleaseVersion(rightValue);

  for (const field of ['major', 'minor', 'patch']) {
    if (left[field] !== right[field]) {
      return left[field] < right[field] ? -1 : 1;
    }
  }

  if (left.stage === null || right.stage === null) {
    if (left.stage === right.stage) return 0;
    return left.stage === null ? 1 : -1;
  }
  if (left.stage !== right.stage) {
    return STAGE_ORDER[left.stage] < STAGE_ORDER[right.stage] ? -1 : 1;
  }
  if (left.stageNumber === right.stageNumber) return 0;
  return left.stageNumber < right.stageNumber ? -1 : 1;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readVersionState(rootDirectory) {
  const packageJson = readJson(path.join(rootDirectory, 'package.json'));
  const packageLock = readJson(path.join(rootDirectory, 'package-lock.json'));
  const appJson = readJson(path.join(rootDirectory, 'app.json'));

  return { appJson, packageJson, packageLock };
}

function parseBuildNumber(value, label) {
  const normalized = typeof value === 'number' ? String(value) : value;
  if (typeof normalized !== 'string' || !/^[1-9]\d*$/.test(normalized)) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return Number(normalized);
}

function validateVersionState({ appJson, packageJson, packageLock }) {
  const release = parseReleaseVersion(packageJson.version);
  const marketingVersion = appJson?.expo?.version;

  if (
    typeof marketingVersion !== 'string' ||
    !MARKETING_VERSION_PATTERN.test(marketingVersion)
  ) {
    throw new Error('Expo version must use the numeric MAJOR.MINOR.PATCH format.');
  }
  if (marketingVersion !== release.marketingVersion) {
    throw new Error('Expo version must match the numeric core of the package version.');
  }
  if (
    packageLock.version !== packageJson.version ||
    packageLock.packages?.['']?.version !== packageJson.version
  ) {
    throw new Error('Package lock version must match the package version.');
  }

  const androidBuild = parseBuildNumber(
    appJson?.expo?.android?.versionCode,
    'Android versionCode',
  );
  const iosBuild = parseBuildNumber(appJson?.expo?.ios?.buildNumber, 'iOS buildNumber');
  if (androidBuild !== iosBuild) {
    throw new Error('Android versionCode and iOS buildNumber must match.');
  }

  return { buildNumber: androidBuild, release };
}

function buildNumberFromAppConfig(appJson) {
  const androidBuild = parseBuildNumber(
    appJson?.expo?.android?.versionCode,
    'Historical Android versionCode',
  );
  const rawIosBuild = appJson?.expo?.ios?.buildNumber;
  const iosBuild = rawIosBuild === undefined ? 0 : parseBuildNumber(rawIosBuild, 'Historical iOS buildNumber');
  return Math.max(androidBuild, iosBuild);
}

function validateHistoricalBuild(currentBuild, previousAppConfigs) {
  const previousMaximum = previousAppConfigs.reduce(
    (maximum, appJson) => Math.max(maximum, buildNumberFromAppConfig(appJson)),
    0,
  );
  if (currentBuild <= previousMaximum) {
    throw new Error(
      `Store build number ${currentBuild} must be greater than the previous maximum ${previousMaximum}.`,
    );
  }
  return previousMaximum;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function bumpVersion(rootDirectory, nextVersion) {
  const state = readVersionState(rootDirectory);
  const current = validateVersionState(state);
  const next = parseReleaseVersion(nextVersion);
  if (compareReleaseVersions(next.value, current.release.value) <= 0) {
    throw new Error('The next release version must be greater than the current release version.');
  }

  const nextBuild = current.buildNumber + 1;
  state.packageJson.version = next.value;
  state.packageLock.version = next.value;
  state.packageLock.packages[''].version = next.value;
  state.appJson.expo.version = next.marketingVersion;
  state.appJson.expo.android.versionCode = nextBuild;
  state.appJson.expo.ios.buildNumber = String(nextBuild);

  writeJson(path.join(rootDirectory, 'package.json'), state.packageJson);
  writeJson(path.join(rootDirectory, 'package-lock.json'), state.packageLock);
  writeJson(path.join(rootDirectory, 'app.json'), state.appJson);

  return { buildNumber: nextBuild, marketingVersion: next.marketingVersion, releaseVersion: next.value };
}

function readPreviousReleaseConfigs(rootDirectory, currentTag) {
  const output = execFileSync('git', ['tag', '--merged', 'HEAD', '--list', 'v*'], {
    cwd: rootDirectory,
    encoding: 'utf8',
  });
  const releaseTagPattern = /^v\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/;
  return output
    .split(/\r?\n/)
    .filter((tag) => tag && tag !== currentTag && releaseTagPattern.test(tag))
    .map((tag) => {
      const appJsonText = execFileSync('git', ['show', `${tag}:app.json`], {
        cwd: rootDirectory,
        encoding: 'utf8',
      });
      return JSON.parse(appJsonText);
    });
}

function validateRelease(rootDirectory, tag, isPrerelease) {
  const state = readVersionState(rootDirectory);
  const current = validateVersionState(state);
  if (tag !== `v${current.release.value}`) {
    throw new Error('Release tag must match the package version.');
  }
  if (isPrerelease !== 'true' || current.release.stage === null) {
    throw new Error('Play internal releases must be GitHub prereleases with a prerelease version.');
  }
  const previousConfigs = readPreviousReleaseConfigs(rootDirectory, tag);
  validateHistoricalBuild(current.buildNumber, previousConfigs);
  return current;
}

function runCli() {
  const rootDirectory = path.resolve(path.dirname(process.argv[1]), '..');
  const [command, argument] = process.argv.slice(2);
  if (command === 'check') {
    const { buildNumber, release } = validateVersionState(readVersionState(rootDirectory));
    process.stdout.write(`Version metadata is valid: ${release.value} (build ${buildNumber}).\n`);
    return;
  }
  if (command === 'bump') {
    if (!argument) throw new Error('Usage: npm run version:bump -- <version>');
    const result = bumpVersion(rootDirectory, argument);
    process.stdout.write(
      `Updated to ${result.releaseVersion}, marketing version ${result.marketingVersion}, build ${result.buildNumber}.\n`,
    );
    return;
  }
  if (command === 'release') {
    const tag = process.env.RELEASE_TAG;
    if (!tag) throw new Error('RELEASE_TAG is required.');
    const { buildNumber, release } = validateRelease(
      rootDirectory,
      tag,
      process.env.IS_PRERELEASE,
    );
    process.stdout.write(`Release metadata is valid: ${release.value} (build ${buildNumber}).\n`);
    return;
  }
  throw new Error('Usage: node scripts/versioning.cjs <check|bump|release>');
}

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  bumpVersion,
  compareReleaseVersions,
  parseReleaseVersion,
  validateHistoricalBuild,
  validateVersionState,
};
