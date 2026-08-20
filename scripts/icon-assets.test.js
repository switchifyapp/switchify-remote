const { Buffer } = require("node:buffer");
const fs = require("node:fs");
const path = require("node:path");
const { describe, expect, test } = require("@jest/globals");

const root = path.resolve(".");
const appJson = require("../app.json");

function readPngHeader(relativePath) {
  const bytes = fs.readFileSync(path.resolve(root, relativePath));
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  expect(bytes.toString("ascii", 12, 16)).toBe("IHDR");

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25],
  };
}

function configPathToRelative(configPath) {
  return configPath.replace(/^\.\//, "");
}

describe("app icon assets", () => {
  const splashPlugin = appJson.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen",
  )[1];
  const configuredPaths = [
    appJson.expo.icon,
    appJson.expo.ios.icon,
    appJson.expo.android.icon,
    appJson.expo.android.adaptiveIcon.foregroundImage,
    appJson.expo.android.adaptiveIcon.monochromeImage,
    splashPlugin.image,
    appJson.expo.web.favicon,
  ];

  test("uses a distinct file for every platform purpose", () => {
    expect(new Set(configuredPaths).size).toBe(configuredPaths.length);
    for (const configPath of configuredPaths) {
      expect(
        fs.existsSync(path.resolve(root, configPathToRelative(configPath))),
      ).toBe(true);
    }
  });

  test.each([
    ["general icon", appJson.expo.icon, 1024, 2],
    ["iOS icon", appJson.expo.ios.icon, 1024, 2],
    ["legacy Android icon", appJson.expo.android.icon, 1024, 2],
    [
      "adaptive foreground",
      appJson.expo.android.adaptiveIcon.foregroundImage,
      1024,
      6,
    ],
    [
      "adaptive monochrome",
      appJson.expo.android.adaptiveIcon.monochromeImage,
      1024,
      6,
    ],
    ["splash mark", splashPlugin.image, 1024, 6],
    ["favicon", appJson.expo.web.favicon, 512, 2],
  ])(
    "%s has the required PNG dimensions and alpha mode",
    (_name, configPath, size, colorType) => {
      expect(readPngHeader(configPathToRelative(configPath))).toEqual({
        width: size,
        height: size,
        colorType,
      });
    },
  );

  test("keeps the adaptive and splash backgrounds aligned", () => {
    expect(appJson.expo.android.adaptiveIcon.backgroundColor).toBe("#050505");
    expect(splashPlugin.backgroundColor).toBe("#050505");
    expect(splashPlugin.dark.backgroundColor).toBe("#050505");
  });

  test("keeps a flat, mask-free vector master and a separate Play listing image", () => {
    const source = fs.readFileSync(
      path.resolve(root, "assets/images/switchify-remote-icon-master.svg"),
      "utf8",
    );
    expect(source).toContain("#D90429");
    expect(source).toContain("#FFFFFF");
    expect(source).toContain("#050505");
    expect(source).not.toMatch(/gradient|filter|shadow/i);
    expect(
      readPngHeader("assets/images/switchify-remote-play-store.png"),
    ).toEqual({
      width: 512,
      height: 512,
      colorType: 6,
    });
  });
});
