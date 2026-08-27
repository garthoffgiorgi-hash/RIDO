import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { mapsErrorMessage } from "./errors.ts";

/**
 * `errors.ts` logs to console.warn outside production, which would bury the test output. Silence
 * it for the duration of a call rather than changing the module's behaviour for tests.
 */
function quietly<T>(fn: () => T): T {
  const original = console.warn;
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.warn = original;
  }
}

const message = (input: Parameters<typeof mapsErrorMessage>[0]): string =>
  quietly(() => mapsErrorMessage(input));

describe("mapsErrorMessage — routing outcomes", () => {
  it("explains NoRoute in terms the rider can act on", () => {
    const m = message({ status: 200, code: "NoRoute" });
    assert.match(m, /couldn't find a driving route/i);
    assert.match(m, /try a different pickup or drop-off/i);
  });

  it("explains NoSegment as a placement problem, not a failure", () => {
    const m = message({ status: 200, code: "NoSegment" });
    assert.match(m, /isn't near a road/i);
    assert.match(m, /closer to a street/i);
  });

  it("recognises a code regardless of case", () => {
    assert.equal(message({ code: "noroute" }), message({ code: "NoRoute" }));
  });
});

describe("mapsErrorMessage — configuration failures", () => {
  it("points a 401 at .env.local rather than blaming the user", () => {
    const m = message({ status: 401 });
    assert.match(m, /aren't configured/i);
    assert.match(m, /\.env\.local/);
  });

  it("points a 403 at the token's URL restrictions", () => {
    const m = message({ status: 403 });
    assert.match(m, /URL restrictions/i);
  });

  it("treats an InvalidInput as bad coordinates", () => {
    assert.match(message({ status: 422, code: "InvalidInput" }), /coordinates/i);
  });
});

describe("mapsErrorMessage — load and network", () => {
  it("tells the user to wait on a 429", () => {
    assert.match(message({ status: 429 }), /too many map requests/i);
  });

  it("treats any 5xx as retryable", () => {
    for (const status of [500, 502, 503]) {
      assert.match(message({ status }), /try again/i);
    }
  });

  it("names the network, not Mapbox, when the request never left", () => {
    for (const raw of ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch"]) {
      const m = message({ raw });
      assert.match(m, /couldn't reach mapbox/i);
      assert.match(m, /firewall, VPN or browser extension/i);
    }
  });

  it("says a timeout is a timeout", () => {
    assert.match(message({ raw: "The operation was aborted due to timeout" }), /took too long/i);
  });
});

describe("mapsErrorMessage — the fallback", () => {
  it("falls back to a generic line for anything unrecognised", () => {
    assert.match(message({ code: "SomethingNew" }), /aren't responding right now/i);
  });

  it("appends the raw detail outside production", () => {
    const m = message({ code: "SomethingNew", raw: "kaboom" });
    assert.match(m, /\(dev: kaboom\)/);
  });

  it("returns a message with no input at all", () => {
    assert.equal(typeof message({}), "string");
    assert.ok(message({}).length > 0);
  });
});

/**
 * A Mapbox URL carries its credential in the query string, so anything that echoes a raw message
 * is one `console.error(url)` away from leaking a token into a log aggregator. No branch may
 * return one — including the dev-only fallback, whose caller is responsible for redacting first.
 */
describe("mapsErrorMessage never leaks a credential", () => {
  const inputs: Parameters<typeof mapsErrorMessage>[0][] = [
    { status: 401, raw: "Not Authorized - Invalid Token: pk.SECRETVALUE" },
    { status: 403, raw: "https://api.mapbox.com/directions/v5?access_token=sk.SECRETVALUE" },
    { code: "NoRoute", raw: "sk.SECRETVALUE" },
    { status: 429, raw: "rate limited for token pk.SECRETVALUE" },
    { status: 500, raw: "pk.SECRETVALUE" },
  ];

  for (const input of inputs) {
    it(`does not echo a token for ${JSON.stringify(input.status ?? input.code)}`, () => {
      assert.ok(!message(input).includes("SECRETVALUE"));
    });
  }
});
