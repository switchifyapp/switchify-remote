const { describe, expect, it } = require("@jest/globals");
const { applyReleaseSigning } = require("./withAndroidReleaseSigning");

const generatedBuildFile = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
        }
    }
}
`;

describe("withAndroidReleaseSigning", () => {
  it("adds environment-backed release signing without changing debug signing", () => {
    const result = applyReleaseSigning(generatedBuildFile);

    expect(result).toContain('System.getenv("UPLOAD_KEYSTORE_PATH")');
    expect(result).toContain("signingConfig signingConfigs.release");
    expect(result).toContain(
      "debug {\n            signingConfig signingConfigs.debug",
    );
  });

  it("is idempotent", () => {
    const once = applyReleaseSigning(generatedBuildFile);
    expect(applyReleaseSigning(once)).toBe(once);
  });

  it("fails when Expo changes the expected Gradle structure", () => {
    expect(() => applyReleaseSigning("android {}")).toThrow(
      "Unable to locate the Android debug signing configuration",
    );
  });
});
