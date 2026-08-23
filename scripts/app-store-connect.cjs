const crypto = require("node:crypto");
const { Buffer } = require("node:buffer");
const fs = require("node:fs");
const https = require("node:https");

const API_HOST = "api.appstoreconnect.apple.com";
const API_AUDIENCE = "appstoreconnect-v1";
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 30 * 1000;
const TERMINAL_FAILURE_STATES = new Set(["FAILED", "INVALID"]);

class AppStoreConnectError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "AppStoreConnectError";
  }
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function createJwt({
  issuerId,
  keyId,
  privateKey,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  if (!issuerId || !keyId || !privateKey) {
    throw new AppStoreConnectError(
      "App Store Connect API credentials are incomplete.",
    );
  }

  const header = base64Url(
    JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }),
  );
  const payload = base64Url(
    JSON.stringify({
      iss: issuerId,
      iat: nowSeconds,
      exp: nowSeconds + 20 * 60,
      aud: API_AUDIENCE,
    }),
  );
  const signingInput = `${header}.${payload}`;

  let signature;
  try {
    signature = crypto.sign("sha256", Buffer.from(signingInput), {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    });
  } catch (error) {
    throw new AppStoreConnectError(
      "Unable to sign the App Store Connect API request.",
      {
        cause: error,
      },
    );
  }

  return `${signingInput}.${base64Url(signature)}`;
}

function sanitizedRequestError(statusCode, requestId) {
  const status = Number.isInteger(statusCode)
    ? `HTTP ${statusCode}`
    : "a network error";
  const suffix = requestId ? ` (request ${requestId})` : "";
  return new AppStoreConnectError(
    `App Store Connect request failed with ${status}${suffix}.`,
  );
}

function requestJson({ token, requestPath, request = https.request }) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: API_HOST,
        method: "GET",
        path: requestPath,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const requestId = response.headers["x-request-id"];
          if (
            !response.statusCode ||
            response.statusCode < 200 ||
            response.statusCode >= 300
          ) {
            reject(sanitizedRequestError(response.statusCode, requestId));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (error) {
            reject(
              new AppStoreConnectError(
                "App Store Connect returned an unreadable response.",
                {
                  cause: error,
                },
              ),
            );
          }
        });
      },
    );
    req.on("error", () => reject(sanitizedRequestError()));
    if (typeof req.setTimeout === "function") {
      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        req.destroy();
        reject(sanitizedRequestError());
      });
    }
    req.end();
  });
}

function createClient({ issuerId, keyId, privateKey, request, nowSeconds }) {
  return {
    async get(requestPath) {
      const token = createJwt({ issuerId, keyId, privateKey, nowSeconds });
      return requestJson({ token, requestPath, request });
    },
  };
}

async function findApp(client, bundleId) {
  const query = new URLSearchParams({
    "filter[bundleId]": bundleId,
    limit: "2",
  });
  const response = await client.get(`/v1/apps?${query}`);
  if (!Array.isArray(response.data)) {
    throw new AppStoreConnectError(
      "App Store Connect returned an invalid app response.",
    );
  }
  if (response.data.length === 0) {
    throw new AppStoreConnectError(
      `No App Store Connect app exists for ${bundleId}.`,
    );
  }
  if (response.data.length > 1 || typeof response.data[0]?.id !== "string") {
    throw new AppStoreConnectError(
      `App Store Connect returned an ambiguous app for ${bundleId}.`,
    );
  }
  return response.data[0];
}

async function findBuild(client, appId, buildNumber) {
  const query = new URLSearchParams({
    "filter[app]": appId,
    "filter[version]": String(buildNumber),
    sort: "-uploadedDate",
    limit: "2",
  });
  const response = await client.get(`/v1/builds?${query}`);
  if (!Array.isArray(response.data)) {
    throw new AppStoreConnectError(
      "App Store Connect returned an invalid build response.",
    );
  }
  if (response.data.length === 0) return null;
  if (response.data.length > 1) {
    throw new AppStoreConnectError(
      `Multiple App Store Connect builds use build ${buildNumber}.`,
    );
  }
  const build = response.data[0];
  if (
    typeof build?.id !== "string" ||
    typeof build.attributes?.processingState !== "string"
  ) {
    throw new AppStoreConnectError(
      "App Store Connect returned an invalid build record.",
    );
  }
  return build;
}

function classifyBuild(build) {
  if (build === null) return { decision: "upload", buildId: null };
  const state = build.attributes.processingState.toUpperCase();
  if (state === "VALID") return { decision: "complete", buildId: build.id };
  if (state === "PROCESSING") return { decision: "poll", buildId: build.id };
  if (TERMINAL_FAILURE_STATES.has(state)) {
    throw new AppStoreConnectError(
      `App Store Connect build ${build.id} finished in the ${state} state; use a new build ordinal.`,
    );
  }
  throw new AppStoreConnectError(
    `App Store Connect build ${build.id} has an unsupported processing state.`,
  );
}

async function lookupBuild(client, bundleId, buildNumber) {
  const app = await findApp(client, bundleId);
  const build = await findBuild(client, app.id, buildNumber);
  return { appId: app.id, ...classifyBuild(build) };
}

async function waitForBuild({
  lookup,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intervalMs = DEFAULT_INTERVAL_MS,
  now = Date.now,
  sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
}) {
  const deadline = now() + timeoutMs;
  for (;;) {
    const result = await lookup();
    if (result.decision === "complete") return result;
    if (now() >= deadline) {
      throw new AppStoreConnectError(
        "Timed out waiting for App Store Connect to validate the build.",
      );
    }
    await sleep(intervalMs);
  }
}

function parseArguments(argumentsList) {
  const options = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const name = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      throw new AppStoreConnectError(
        "App Store Connect helper arguments are invalid.",
      );
    }
    options[name.slice(2)] = value;
  }
  return options;
}

function writeGithubOutput(result) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = [`decision=${result.decision}`, `app_id=${result.appId}`];
  if (result.buildId) lines.push(`build_id=${result.buildId}`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`, "utf8");
}

async function runCli() {
  const [command, ...rawOptions] = process.argv.slice(2);
  if (!["preflight", "wait"].includes(command)) {
    throw new AppStoreConnectError(
      "Usage: node scripts/app-store-connect.cjs <preflight|wait> --bundle-id <id> --build-number <number>",
    );
  }
  const options = parseArguments(rawOptions);
  if (
    !options["bundle-id"] ||
    !/^[1-9]\d*$/.test(options["build-number"] ?? "")
  ) {
    throw new AppStoreConnectError(
      "A bundle ID and positive build number are required.",
    );
  }
  const keyPath = process.env.ASC_API_PRIVATE_KEY_PATH;
  if (!keyPath)
    throw new AppStoreConnectError("ASC_API_PRIVATE_KEY_PATH is required.");
  const privateKey = fs.readFileSync(keyPath, "utf8");
  const client = createClient({
    issuerId: process.env.ASC_API_ISSUER_ID,
    keyId: process.env.ASC_API_KEY_ID,
    privateKey,
  });
  const lookup = () =>
    lookupBuild(client, options["bundle-id"], options["build-number"]);
  const result =
    command === "wait"
      ? await waitForBuild({
          lookup,
          timeoutMs:
            Number(options["timeout-seconds"] ?? DEFAULT_TIMEOUT_MS / 1000) *
            1000,
        })
      : await lookup();
  writeGithubOutput(result);
  process.stdout.write(
    `${result.decision === "complete" ? "Build is valid" : `Build action: ${result.decision}`} (${result.appId}).\n`,
  );
}

if (require.main === module) {
  runCli().catch((error) => {
    const message =
      error instanceof AppStoreConnectError
        ? error.message
        : "Unexpected helper failure.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  AppStoreConnectError,
  classifyBuild,
  createClient,
  createJwt,
  findApp,
  findBuild,
  lookupBuild,
  requestJson,
  waitForBuild,
};
