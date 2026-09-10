import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { parseRidesLive } from "./live.ts";

describe("parseRidesLive — the fail-safe default", () => {
  it("enables only on the exact literal 'true'", () => {
    assert.equal(parseRidesLive("true"), true);
  });

  // Everything below is a plausible way to get this wrong — a typo, a different casing, a
  // stringified falsy value — and every one of them must resolve to disabled. This is the test a
  // "just make it truthy" refactor has to argue with.
  it("stays disabled for every near-miss", () => {
    const nearMisses = [undefined, "", "false", "0", "TRUE", "True", " true", "true ", "1", "yes"];
    for (const value of nearMisses) {
      assert.equal(
        parseRidesLive(value),
        false,
        `expected ${JSON.stringify(value)} to be disabled`,
      );
    }
  });
});
