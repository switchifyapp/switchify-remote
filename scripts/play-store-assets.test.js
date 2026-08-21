const { Buffer } = require("node:buffer");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
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

function decodeRgb(relativePath) {
  const bytes = fs.readFileSync(path.join(root, relativePath));
  const { width, height, colorType } = pngHeader(relativePath);
  expect(colorType).toBe(2);
  const idatChunks = [];
  let chunkOffset = 8;
  while (chunkOffset < bytes.length) {
    const length = bytes.readUInt32BE(chunkOffset);
    if (bytes.toString("ascii", chunkOffset + 4, chunkOffset + 8) === "IDAT") {
      idatChunks.push(
        bytes.subarray(chunkOffset + 8, chunkOffset + 8 + length),
      );
    }
    chunkOffset += length + 12;
  }

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const rowLength = width * 3;
  const pixels = Buffer.alloc(rowLength * height);
  let sourceOffset = 0;
  let previous = Buffer.alloc(rowLength);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = pixels.subarray(y * rowLength, (y + 1) * rowLength);
    for (let x = 0; x < rowLength; x += 1) {
      const raw = inflated[sourceOffset];
      sourceOffset += 1;
      const left = x >= 3 ? row[x - 3] : 0;
      const above = previous[x];
      const upperLeft = x >= 3 ? previous[x - 3] : 0;
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
    }
    previous = row;
  }
  return { height, pixels, width };
}

function rgbAt(image, x, y) {
  const offset = (y * image.width + x) * 3;
  return [...image.pixels.subarray(offset, offset + 3)];
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

  test.each([
    "01-pair.png",
    "02-mouse.png",
    "03-typing.png",
    "04-window.png",
    "05-access.png",
  ])("keeps the shared brand and red device frame: %s", (fileName) => {
    const image = decodeRgb(
      path.join("docs", "play-store-assets", "phone", fileName),
    );
    expect(rgbAt(image, 170, 250)).toEqual([217, 3, 41]);

    let brandPixels = 0;
    for (let y = 40; y < 90; y += 1) {
      for (let x = 350; x < 730; x += 1) {
        const [red, green, blue] = rgbAt(image, x, y);
        if (red > 170 && green < 80 && blue < 100) brandPixels += 1;
      }
    }
    expect(brandPixels).toBeGreaterThan(100);
  });
});
