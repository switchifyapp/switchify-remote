const crypto = require("node:crypto");
const { Buffer } = require("node:buffer");
const { EventEmitter } = require("node:events");
const { describe, expect, test } = require("@jest/globals");

const {
  classifyBuild,
  createJwt,
  findApp,
  findBuild,
  lookupBuild,
  requestJson,
  waitForBuild,
} = require("./app-store-connect.cjs");

function decodePart(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function build(state, id = "build-13", marketingVersion = "1.0.0") {
  return {
    id,
    attributes: { processingState: state },
    relationships: {
      preReleaseVersion: { data: { id: `version-${marketingVersion}` } },
    },
    marketingVersion,
  };
}

function buildResponse(state, id = "build-13", marketingVersion = "1.0.0") {
  const record = build(state, id, marketingVersion);
  delete record.marketingVersion;
  return {
    data: [record],
    included: [
      {
        type: "preReleaseVersions",
        id: `version-${marketingVersion}`,
        attributes: { version: marketingVersion },
      },
    ],
  };
}

describe("App Store Connect JWT", () => {
  test("uses the required ES256 header and bounded claims", () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" });
    const token = createJwt({
      issuerId: "issuer-id",
      keyId: "KEY123",
      privateKey: privateKeyPem,
      nowSeconds: 1_800_000_000,
    });
    const [header, payload, signature] = token.split(".");

    expect(decodePart(header)).toEqual({
      alg: "ES256",
      kid: "KEY123",
      typ: "JWT",
    });
    expect(decodePart(payload)).toEqual({
      iss: "issuer-id",
      iat: 1_800_000_000,
      exp: 1_800_001_200,
      aud: "appstoreconnect-v1",
    });
    expect(
      crypto.verify(
        "sha256",
        Buffer.from(`${header}.${payload}`),
        {
          key: publicKey,
          dsaEncoding: "ieee-p1363",
        },
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
  });

  test("does not expose key material when signing fails", () => {
    expect(() =>
      createJwt({
        issuerId: "issuer-id",
        keyId: "KEY123",
        privateKey: "private-secret-that-must-not-leak",
      }),
    ).toThrow("Unable to sign");
    try {
      createJwt({
        issuerId: "issuer-id",
        keyId: "KEY123",
        privateKey: "private-secret",
      });
    } catch (error) {
      expect(error.message).not.toContain("private-secret");
    }
  });
});

describe("App Store Connect lookup", () => {
  test("finds the app and build with encoded filters", async () => {
    const requests = [];
    const client = {
      get: async (requestPath) => {
        requests.push(requestPath);
        if (requestPath.startsWith("/v1/apps?"))
          return { data: [{ id: "app-1" }] };
        return buildResponse("VALID");
      },
    };

    await expect(
      lookupBuild(client, "com.enaboapps.switchify.remote", 13, "1.0.0"),
    ).resolves.toEqual({
      appId: "app-1",
      buildId: "build-13",
      decision: "complete",
    });
    expect(requests[0]).toContain(
      "filter%5BbundleId%5D=com.enaboapps.switchify.remote",
    );
    expect(requests[1]).toContain("filter%5Bversion%5D=13");
    expect(requests[1]).toContain("include=preReleaseVersion");
  });

  test("reports an absent build as ready to upload", async () => {
    const responses = [{ data: [{ id: "app-1" }] }, { data: [] }];
    const client = { get: async () => responses.shift() };
    await expect(
      lookupBuild(client, "com.enaboapps.switchify.remote", 13, "1.0.0"),
    ).resolves.toEqual({
      appId: "app-1",
      buildId: null,
      decision: "upload",
    });
  });

  test("reports a processing build for polling", () => {
    expect(classifyBuild(build("PROCESSING"), "1.0.0")).toEqual({
      buildId: "build-13",
      decision: "poll",
    });
  });

  test("treats an existing valid build as an idempotent success", () => {
    expect(classifyBuild(build("VALID"), "1.0.0")).toEqual({
      buildId: "build-13",
      decision: "complete",
    });
  });

  test.each(["FAILED", "INVALID"])("rejects the terminal %s state", (state) => {
    expect(() => classifyBuild(build(state), "1.0.0")).toThrow(
      "use a new build ordinal",
    );
  });

  test("rejects an existing build from a different marketing version", () => {
    expect(() =>
      classifyBuild(build("VALID", "build-13", "0.9.0"), "1.0.0"),
    ).toThrow("different marketing version");
  });

  test("rejects missing and ambiguous apps", async () => {
    await expect(
      findApp({ get: async () => ({ data: [] }) }, "missing.app"),
    ).rejects.toThrow("No App Store Connect app");
    await expect(
      findApp(
        { get: async () => ({ data: [{ id: "1" }, { id: "2" }] }) },
        "duplicate.app",
      ),
    ).rejects.toThrow("ambiguous app");
  });

  test("rejects duplicate build ordinals", async () => {
    await expect(
      findBuild(
        {
          get: async () => ({
            data: [build("VALID", "one"), build("VALID", "two")],
          }),
        },
        "app-1",
        13,
      ),
    ).rejects.toThrow("Multiple App Store Connect builds");
  });

  test("rejects a build without an included marketing version", async () => {
    const record = build("VALID");
    delete record.marketingVersion;
    await expect(
      findBuild(
        { get: async () => ({ data: [record], included: [] }) },
        "app-1",
        13,
      ),
    ).rejects.toThrow("without a readable marketing version");
  });
});

describe("App Store Connect polling", () => {
  test("waits through absence and processing until the build is valid", async () => {
    const results = [
      { decision: "upload", appId: "app-1", buildId: null },
      { decision: "poll", appId: "app-1", buildId: "build-13" },
      { decision: "complete", appId: "app-1", buildId: "build-13" },
    ];
    let now = 0;
    const result = await waitForBuild({
      lookup: async () => results.shift(),
      intervalMs: 100,
      timeoutMs: 1_000,
      now: () => now,
      sleep: async (duration) => {
        now += duration;
      },
    });
    expect(result.decision).toBe("complete");
  });

  test("fails after the configured timeout", async () => {
    let now = 0;
    await expect(
      waitForBuild({
        lookup: async () => ({
          decision: "poll",
          appId: "app-1",
          buildId: "build-13",
        }),
        intervalMs: 100,
        timeoutMs: 200,
        now: () => now,
        sleep: async (duration) => {
          now += duration;
        },
      }),
    ).rejects.toThrow("Timed out");
  });
});

describe("sanitized request failures", () => {
  test("reports only status and request ID", async () => {
    const request = (_options, callback) => {
      const response = new EventEmitter();
      response.statusCode = 401;
      response.headers = { "x-request-id": "safe-request-id" };
      const req = new EventEmitter();
      req.end = () => {
        callback(response);
        response.emit("data", Buffer.from('{"detail":"server-secret"}'));
        response.emit("end");
      };
      return req;
    };

    let message = "";
    try {
      await requestJson({
        token: "jwt-secret",
        requestPath: "/v1/apps",
        request,
      });
    } catch (error) {
      message = error.message;
    }
    expect(message).toBe(
      "App Store Connect request failed with HTTP 401 (request safe-request-id).",
    );
    expect(message).not.toContain("server-secret");
    expect(message).not.toContain("jwt-secret");
  });
});
