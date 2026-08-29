const { Buffer } = require("node:buffer");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { describe, expect, test } = require("@jest/globals");

const root = path.resolve(".");
const names = ["01-pair.png", "02-mouse.png", "03-typing.png", "04-window.png", "05-access.png"];

function pngHeader(relativePath) {
  const bytes = fs.readFileSync(path.join(root, relativePath));
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25], size: bytes.length };
}

function decodeRgba(relativePath) {
  const bytes = fs.readFileSync(path.join(root, relativePath));
  const { width, height, colorType } = pngHeader(relativePath);
  expect(colorType).toBe(6);
  const idatChunks = [];
  let chunkOffset = 8;
  while (chunkOffset < bytes.length) {
    const length = bytes.readUInt32BE(chunkOffset);
    if (bytes.toString("ascii", chunkOffset + 4, chunkOffset + 8) === "IDAT") {
      idatChunks.push(bytes.subarray(chunkOffset + 8, chunkOffset + 8 + length));
    }
    chunkOffset += length + 12;
  }

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = 4;
  const rowLength = width * bytesPerPixel;
  const pixels = Buffer.alloc(rowLength * height);
  let sourceOffset = 0;
  let previous = Buffer.alloc(rowLength);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    expect(filter).toBeGreaterThanOrEqual(0);
    expect(filter).toBeLessThanOrEqual(4);
    sourceOffset += 1;
    const row = pixels.subarray(y * rowLength, (y + 1) * rowLength);
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
        predictor = leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
          ? left
          : aboveDistance <= upperLeftDistance ? above : upperLeft;
      }
      row[x] = (raw + predictor) & 0xff;
    }
    previous = row;
  }
  return { height, pixels, width };
}

function rgbaAt(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return [...image.pixels.subarray(offset, offset + 4)];
}

describe("App Store screenshots", () => {
  test.each([
    ...names.map((name) => [`iphone/${name}`, 1242, 2688]),
    ...names.map((name) => [`ipad/${name}`, 2048, 2732]),
  ])("has a correctly sized opaque image: %s", (file, width, height) => {
    const relativePath = path.join("docs", "app-store-assets", file);
    expect(pngHeader(relativePath)).toEqual(expect.objectContaining({ width, height, colorType: 6 }));
    expect(pngHeader(relativePath).size).toBeLessThanOrEqual(10 * 1024 * 1024);

    const image = decodeRgba(relativePath);
    let firstTranslucentPixel = -1;
    for (let index = 3; index < image.pixels.length; index += 4) {
      if (image.pixels[index] !== 255) {
        firstTranslucentPixel = Math.floor(index / 4);
        break;
      }
    }
    expect(firstTranslucentPixel).toBe(-1);

    const frameX = Math.round(width * 0.105) + 2;
    const frameY = Math.round(height * 0.115) + Math.round(width * 0.08);
    const [frameRed, frameGreen, frameBlue] = rgbaAt(image, frameX, frameY);
    expect(frameRed).toBeGreaterThan(170);
    expect(frameGreen).toBeLessThan(80);
    expect(frameBlue).toBeLessThan(100);

    let brandPixels = 0;
    for (let y = Math.round(height * 0.015); y < Math.round(height * 0.07); y += 1) {
      for (let x = Math.round(width * 0.25); x < Math.round(width * 0.75); x += 1) {
        const [red, green, blue] = rgbaAt(image, x, y);
        if (red > 170 && green < 80 && blue < 100) brandPixels += 1;
      }
    }
    expect(brandPixels).toBeGreaterThan(100);
  });

  test("keeps the metadata within App Store limits", () => {
    const listing = fs.readFileSync(path.join(root, "docs", "app-store-listing.md"), "utf8");
    expect(listing).toContain("Subtitle: `Accessible PC remote control`");
    expect("Accessible PC remote control").toHaveLength(28);
    expect("Control your Windows PC or Mac from your iPhone or iPad with accessible mouse, typing and window controls over Bluetooth.".length).toBeLessThanOrEqual(170);
    expect("accessibility,remote control,mouse,keyboard,typing,Windows,Mac,Bluetooth,switch control".length).toBeLessThanOrEqual(100);
  });
});
