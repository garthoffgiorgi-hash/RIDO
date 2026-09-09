import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { settleCompletedRide } from "./settlement.ts";

/** Swallowed failures go here instead of the console, so a passing run stays quiet. */
function recorder() {
  const logged: string[] = [];
  return { logged, log: (message: string) => logged.push(message) };
}

describe("settleCompletedRide — ordering", () => {
  // ADR-0017: the capture funds the platform balance the transfer draws on. Reversed, the payout
  // asks for money that hasn't arrived — the balance_insufficient failure rider charging exists
  // to end. This is the test a refactor that "parallelises for speed" has to argue with.
  it("captures strictly before it pays out", async () => {
    const calls: string[] = [];
    const { log } = recorder();

    await settleCompletedRide({
      capture: async () => {
        calls.push("capture:start");
        await Promise.resolve();
        calls.push("capture:end");
      },
      payout: async () => {
        calls.push("payout:start");
      },
      log,
    });

    assert.deepEqual(calls, ["capture:start", "capture:end", "payout:start"]);
  });
});

describe("settleCompletedRide — neither failure may propagate", () => {
  // The ride is already completed and the debt already recorded by queue_driver_payout. A throw
  // reaching the caller would turn a finished ride into a failure on the driver's screen.
  it("does not throw when the capture fails", async () => {
    const { logged, log } = recorder();
    await settleCompletedRide({
      capture: () => Promise.reject(new Error("card network down")),
      payout: async () => {},
      log,
    });
    assert.equal(logged.length, 1);
    assert.match(logged[0] ?? "", /captureRideCharge/);
  });

  it("does not throw when the payout fails", async () => {
    const { logged, log } = recorder();
    await settleCompletedRide({
      capture: async () => {},
      payout: () => Promise.reject(new Error("balance_insufficient")),
      log,
    });
    assert.equal(logged.length, 1);
    assert.match(logged[0] ?? "", /payoutRide/);
  });

  it("does not throw when both fail, and reports both", async () => {
    const { logged, log } = recorder();
    await settleCompletedRide({
      capture: () => Promise.reject(new Error("card network down")),
      payout: () => Promise.reject(new Error("balance_insufficient")),
      log,
    });
    assert.equal(logged.length, 2);
  });

  // The driver is owed whether or not RIDO managed to collect yet, and the platform balance may
  // cover it from other rides. A failed capture must not silently skip the payout.
  it("still attempts the payout after a failed capture", async () => {
    let paidOut = false;
    const { log } = recorder();

    await settleCompletedRide({
      capture: () => Promise.reject(new Error("card network down")),
      payout: async () => {
        paidOut = true;
      },
      log,
    });

    assert.equal(paidOut, true);
  });
});

describe("settleCompletedRide — the happy path stays quiet", () => {
  it("runs both steps and logs nothing when both succeed", async () => {
    const { logged, log } = recorder();
    let captured = false;
    let paidOut = false;

    await settleCompletedRide({
      capture: async () => {
        captured = true;
      },
      payout: async () => {
        paidOut = true;
      },
      log,
    });

    assert.equal(captured, true);
    assert.equal(paidOut, true);
    assert.deepEqual(logged, []);
  });
});
