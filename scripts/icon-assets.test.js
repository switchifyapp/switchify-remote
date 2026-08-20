const { Buffer } = require("node:buffer");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
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

function maxOpaquePixelDistance(relativePath) {
  const bytes = fs.readFileSync(path.resolve(root, relativePath));
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const idatChunks = [];
  let offset = 8;

  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") {
      idatChunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = 4;
  const rowLength = width * bytesPerPixel;
  let sourceOffset = 0;
  let previous = Buffer.alloc(rowLength);
  let maxDistanceSquared = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = Buffer.alloc(rowLength);

    for (let x = 0; x < rowLength; x += 1) {
      const raw = inflated[sourceOffset];
      sourceOffset += 1;
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const above = previous[x];
      const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      let predictor = 0;

      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) {
        const estimate = left + above - upperLeft;
        const leftDistance = Math.abs(estimate - left);
        const aboveDistance = Math.abs(estimate - above);
        const upperLeftDistance = Math.abs(estimate - upperLeft);
        predictor =
          leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
            ? left
            : aboveDistance <= upperLeftDistance
              ? above
              : upperLeft;
      }

      row[x] = (raw + predictor) & 0xff;
      if (x % bytesPerPixel === 3 && row[x] > 0) {
        const pixelX = Math.floor(x / bytesPerPixel) + 0.5;
        const pixelY = y + 0.5;
        const dx = pixelX - width / 2;
        const dy = pixelY - height / 2;
        maxDistanceSquared = Math.max(maxDistanceSquared, dx * dx + dy * dy);
      }
    }
    previous = row;
  }

  return Math.sqrt(maxDistanceSquared);
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

  test.each([
    ["adaptive foreground", appJson.expo.android.adaptiveIcon.foregroundImage],
    ["adaptive monochrome", appJson.expo.android.adaptiveIcon.monochromeImage],
  ])(
    "keeps the %s inside Android's circular safe zone",
    (_name, configPath) => {
      const guaranteedRadius = (1024 * 33) / 108;
      expect(
        maxOpaquePixelDistance(configPathToRelative(configPath)),
      ).toBeLessThanOrEqual(guaranteedRadius);
    },
  );

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
