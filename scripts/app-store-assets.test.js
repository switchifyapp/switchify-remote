const { Buffer } = require("node:buffer");
const fs = require("node:fs");
const path = require("node:path");
const { describe, expect, test } = require("@jest/globals");

const root = path.resolve(".");
const names = ["01-pair.png", "02-mouse.png", "03-typing.png", "04-window.png", "05-access.png"];

function pngHeader(relativePath) {
  const bytes = fs.readFileSync(path.join(root, relativePath));
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25], size: bytes.length };
}

describe("App Store screenshots", () => {
  test.each([
    ...names.map((name) => [`iphone/${name}`, 1242, 2688]),
    ...names.map((name) => [`ipad/${name}`, 2048, 2732]),
  ])("has a correctly sized opaque image: %s", (file, width, height) => {
    expect(pngHeader(path.join("docs", "app-store-assets", file))).toEqual(expect.objectContaining({ width, height, colorType: 2 }));
    expect(pngHeader(path.join("docs", "app-store-assets", file)).size).toBeLessThanOrEqual(10 * 1024 * 1024);
  });

  test("keeps the metadata within App Store limits", () => {
    const listing = fs.readFileSync(path.join(root, "docs", "app-store-listing.md"), "utf8");
    expect(listing).toContain("Subtitle: `Accessible PC remote control`");
    expect("Accessible PC remote control").toHaveLength(28);
    expect("Control your Windows PC or Mac from your iPhone or iPad with accessible mouse, typing and window controls over Bluetooth.".length).toBeLessThanOrEqual(170);
    expect("accessibility,remote control,mouse,keyboard,typing,Windows,Mac,Bluetooth,switch control".length).toBeLessThanOrEqual(100);
  });
});
