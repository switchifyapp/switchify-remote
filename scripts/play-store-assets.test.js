const { Buffer } = require("node:buffer");
const fs = require("node:fs");
const path = require("node:path");
const { describe, expect, test } = require("@jest/globals");

const root = path.resolve(".");

function pngHeader(relativePath) {
  const bytes = fs.readFileSync(path.join(root, relativePath));
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25],
    size: bytes.length,
  };
}

describe("Google Play artwork", () => {
  test("uses the existing compliant Play icon", () => {
    expect(pngHeader("assets/images/switchify-remote-play-store.png")).toEqual(
      expect.objectContaining({ width: 512, height: 512 }),
    );
    expect(
      pngHeader("assets/images/switchify-remote-play-store.png").size,
    ).toBeLessThanOrEqual(1024 * 1024);
  });

  test("has one opaque feature graphic", () => {
    expect(pngHeader("docs/play-store-assets/feature-graphic.png")).toEqual(
      expect.objectContaining({ width: 1024, height: 500, colorType: 2 }),
    );
    expect(
      pngHeader("docs/play-store-assets/feature-graphic.png").size,
    ).toBeLessThanOrEqual(15 * 1024 * 1024);
  });

  test.each([
    "01-pair.png",
    "02-mouse.png",
    "03-typing.png",
    "04-window.png",
    "05-access.png",
  ])("has a compliant opaque phone screenshot: %s", (fileName) => {
    const header = pngHeader(
      path.join("docs", "play-store-assets", "phone", fileName),
    );
    expect(header).toEqual(
      expect.objectContaining({ width: 1080, height: 1920, colorType: 2 }),
    );
    expect(header.size).toBeLessThanOrEqual(8 * 1024 * 1024);
  });
});
