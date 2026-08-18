const { withAppBuildGradle } = require("@expo/config-plugins");

const releaseSigningConfig = `        release {
            def keystorePath = System.getenv("UPLOAD_KEYSTORE_PATH")
            if (keystorePath) {
                storeFile file(keystorePath)
                storePassword System.getenv("UPLOAD_KEYSTORE_PASSWORD")
                keyAlias System.getenv("UPLOAD_KEY_ALIAS")
                keyPassword System.getenv("UPLOAD_KEY_PASSWORD")
            }
        }
`;

function applyReleaseSigning(contents) {
  if (contents.includes('System.getenv("UPLOAD_KEYSTORE_PATH")'))
    return contents;

  const signingConfigs =
    /(\n {4}signingConfigs \{\r?\n {8}debug \{[\s\S]*?\r?\n {8}\}\r?\n)( {4}\})/;
  if (!signingConfigs.test(contents)) {
    throw new Error("Unable to locate the Android debug signing configuration");
  }

  const withReleaseConfig = contents.replace(
    signingConfigs,
    `$1${releaseSigningConfig}$2`,
  );
  const releaseBuildType =
    /(\n {4}buildTypes \{[\s\S]*?\n {8}release \{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!releaseBuildType.test(withReleaseConfig)) {
    throw new Error("Unable to locate the Android release build type");
  }

  return withReleaseConfig.replace(
    releaseBuildType,
    "$1signingConfig signingConfigs.release",
  );
}

function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== "groovy") {
      throw new Error(
        "Switchify Remote requires a Groovy Android app build file",
      );
    }
    gradleConfig.modResults.contents = applyReleaseSigning(
      gradleConfig.modResults.contents,
    );
    return gradleConfig;
  });
}

module.exports = withAndroidReleaseSigning;
module.exports.applyReleaseSigning = applyReleaseSigning;
