const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(".");
const outputRoot = path.join(root, "docs", "app-store-assets");
const captures = [
  ["01-pair.png", "Pair securely over Bluetooth"],
  ["02-mouse.png", "Move, click and scroll"],
  ["03-typing.png", "Type from iPhone or iPad"],
  ["04-window.png", "Manage windows quickly"],
  ["05-access.png", "Made for accessible control"],
];

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) return null;
  return path.resolve(process.argv[index + 1]);
}

const sets = [
  { name: "iphone", source: argument("--iphone-source-dir"), width: 1242, height: 2688 },
  { name: "ipad", source: argument("--ipad-source-dir"), width: 2048, height: 2732 },
];
if (sets.some(({ source }) => !source)) {
  throw new Error("Usage: node scripts/generate-app-store-assets.cjs --iphone-source-dir <directory> --ipad-source-dir <directory>");
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `${command} exited with ${result.status}`);
}

for (const set of sets) {
  const output = path.join(outputRoot, set.name);
  fs.mkdirSync(output, { recursive: true });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), `switchify-app-store-${set.name}-`));
  try {
    for (const [fileName, caption] of captures) {
      const source = path.join(set.source, fileName);
      if (!fs.existsSync(source)) throw new Error(`Missing capture: ${source}`);
      if (process.platform !== "darwin") throw new Error("App Store screenshot rendering requires macOS and Xcode.");
      const rendered = path.join(temp, fileName);
      const jpeg = path.join(temp, `${fileName}.jpg`);
      run("xcrun", ["swift", path.join(root, "scripts", "generate-app-store-asset.swift"), source, rendered, String(set.width), String(set.height), caption]);
      run("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "100", rendered, "--out", jpeg]);
      run("sips", ["-s", "format", "png", jpeg, "--out", path.join(output, fileName)]);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
