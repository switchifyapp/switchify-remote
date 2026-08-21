const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(".");
const outputRoot = path.join(root, "docs", "play-store-assets");
const featureSource = path.join(outputRoot, "source", "feature-graphic.svg");
const phoneOutput = path.join(outputRoot, "phone");
const ffmpegFont = "fontfile='C\\:/Windows/Fonts/arial.ttf'";
const captures = [
  ["01-pair.png", "Pair securely over Bluetooth"],
  ["02-mouse.png", "Move, click and scroll"],
  ["03-typing.png", "Type from your phone"],
  ["04-window.png", "Manage windows quickly"],
  ["05-access.png", "Made for accessible control"],
];

const sourceFlag = process.argv.indexOf("--source-dir");
if (sourceFlag === -1 || !process.argv[sourceFlag + 1]) {
  throw new Error(
    "Usage: node scripts/generate-play-store-assets.cjs --source-dir <capture-directory>",
  );
}
const sourceDir = path.resolve(process.argv[sourceFlag + 1]);
fs.mkdirSync(phoneOutput, { recursive: true });

function runFfmpeg(args) {
  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", ...args],
    {
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || `ffmpeg exited with ${result.status}`);
  }
}

const browser = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate) => fs.existsSync(candidate));
if (!browser)
  throw new Error(
    "Microsoft Edge or Google Chrome is required to render the feature graphic.",
  );

const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "switchify-play-assets-"),
);
try {
  const featureTemp = path.join(tempRoot, "feature.png");
  const browserResult = spawnSync(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--window-size=1024,500",
      `--user-data-dir=${path.join(tempRoot, "browser-profile")}`,
      `--screenshot=${featureTemp}`,
      pathToFileURL(featureSource).href,
    ],
    { encoding: "utf8" },
  );
  if (browserResult.status !== 0 || !fs.existsSync(featureTemp)) {
    throw new Error(
      browserResult.stderr || "Browser could not render the feature graphic.",
    );
  }
  runFfmpeg([
    "-i",
    featureTemp,
    "-frames:v",
    "1",
    "-pix_fmt",
    "rgb24",
    path.join(outputRoot, "feature-graphic.png"),
  ]);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

for (const [fileName, caption] of captures) {
  const source = path.join(sourceDir, fileName);
  if (!fs.existsSync(source)) throw new Error(`Missing capture: ${source}`);
  const escapedCaption = caption.replace(/'/g, "\\'");
  const sanitizedCapture =
    fileName === "01-pair.png"
      ? `[0:v]drawbox=x=94:y=634:w=690:h=100:color=#17171A:t=fill,drawtext=${ffmpegFont}:text='Demo computer':fontcolor=#FFFFFF:fontsize=46:x=108:y=653,drawbox=x=704:y=884:w=360:h=90:color=#17171A:t=fill,drawtext=${ffmpegFont}:text='Unpair Demo PC':fontcolor=#FF5C7A:fontsize=30:x=720:y=908,crop=1080:2274:0:84,scale=720:1600:force_original_aspect_ratio=decrease,pad=720:1600:(ow-iw)/2:(oh-ih)/2:color=#0B0B0D[shot]`
      : fileName === "05-access.png"
        ? "[0:v]crop=1080:1998:0:360,scale=720:1600:force_original_aspect_ratio=decrease,pad=720:1600:(ow-iw)/2:(oh-ih)/2:color=#0B0B0D[shot]"
        : `[0:v]drawbox=x=130:y=198:w=360:h=66:color=#143C25:t=fill,drawtext=${ffmpegFont}:text='Connected · Demo PC':fontcolor=#72E58F:fontsize=30:x=137:y=209,crop=1080:2274:0:84,scale=720:1600:force_original_aspect_ratio=decrease,pad=720:1600:(ow-iw)/2:(oh-ih)/2:color=#0B0B0D[shot]`;
  const filter = [
    sanitizedCapture,
    "[1:v]drawbox=x=168:y=248:w=744:h=1624:color=#D90429:t=fill,drawbox=x=176:y=256:w=728:h=1608:color=#17171A:t=fill[base]",
    "[base][shot]overlay=180:260[screen]",
    `[screen]drawtext=${ffmpegFont}:text='Switchify Remote':fontcolor=#D90429:fontsize=30:x=(w-text_w)/2:y=48,drawtext=${ffmpegFont}:text='${escapedCaption}':fontcolor=#FFFFFF:fontsize=58:x=(w-text_w)/2:y=112`,
  ].join(";");
  runFfmpeg([
    "-i",
    source,
    "-f",
    "lavfi",
    "-i",
    "color=c=#050505:s=1080x1920",
    "-filter_complex",
    filter,
    "-frames:v",
    "1",
    "-pix_fmt",
    "rgb24",
    path.join(phoneOutput, fileName),
  ]);
}
