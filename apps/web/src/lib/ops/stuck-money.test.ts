import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  isCaptureStuck,
  isPayoutStuck,
  type StuckChargeCandidate,
  type StuckPayoutCandidate,
  type SweepAttemptOutcome,
  sweepStuckMoney,
} from "./stuck-money.ts";

const NOW = new Date("2026-09-10T12:00:00.000Z");
const minutesBefore = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();

/** Swallowed rows go here instead of the console, so a passing run stays quiet. */
function recorder() {
  const logged: string[] = [];
  return { logged, log: (message: string) => logged.push(message) };
}

describe("isCaptureStuck", () => {
  it("is not stuck 2 minutes after completion", () => {
    const charge: StuckChargeCandidate = {
      rideId: "r1",
      status: "authorized",
      completedAt: minutesBefore(2),
    };
    assert.equal(isCaptureStuck(charge, NOW), false);
  });

  it("is stuck 20 minutes after completion", () => {
    const charge: StuckChargeCandidate = {
      rideId: "r1",
      status: "authorized",
      completedAt: minutesBefore(20),
    };
    assert.equal(isCaptureStuck(charge, NOW), true);
  });

  it("is stuck exactly at the 15-minute threshold", () => {
    const charge: StuckChargeCandidate = {
      rideId: "r1",
      status: "authorized",
      completedAt: minutesBefore(15),
    };
    assert.equal(isCaptureStuck(charge, NOW), true);
  });

  // The property this file's header names as load-bearing: an 'authorizing' row has no valid
  // capturable authorization at all, no matter its age, and must never be treated as capturable.
  it("is never stuck-and-capturable while still 'authorizing', no matter the age", () => {
    const charge: StuckChargeCandidate = {
      rideId: "r1",
      status: "authorizing",
      completedAt: minutesBefore(1000),
    };
    assert.equal(isCaptureStuck(charge, NOW), false);
  });
});

describe("isPayoutStuck", () => {
  it("is not stuck 10 minutes after the last attempt", () => {
    const payout: StuckPayoutCandidate = {
      payoutId: "p1",
      status: "pending",
      updatedAt: minutesBefore(10),
    };
    assert.equal(isPayoutStuck(payout, NOW), false);
  });

  it("is stuck 45 minutes after the last attempt", () => {
    const payout: StuckPayoutCandidate = {
      payoutId: "p1",
      status: "pending",
      updatedAt: minutesBefore(45),
    };
    assert.equal(isPayoutStuck(payout, NOW), true);
  });

  it("is stuck exactly at the 30-minute threshold", () => {
    const payout: StuckPayoutCandidate = {
      payoutId: "p1",
      status: "pending",
      updatedAt: minutesBefore(30),
    };
    assert.equal(isPayoutStuck(payout, NOW), true);
  });

  // THE property ADR-0025 exists to state: a terminal row is never retried, at any age. This is
  // the test a "just retry everything past the threshold" refactor has to argue with.
  it("is never stuck while 'failed', no matter the age", () => {
    const payout: StuckPayoutCandidate = {
      payoutId: "p1",
      status: "failed",
      updatedAt: minutesBefore(100_000),
    };
    assert.equal(isPayoutStuck(payout, NOW), false);
  });

  it("is never stuck while 'paid', no matter the age", () => {
    const payout: StuckPayoutCandidate = {
      payoutId: "p1",
      status: "paid",
      updatedAt: minutesBefore(100_000),
    };
    assert.equal(isPayoutStuck(payout, NOW), false);
  });
});

describe("sweepStuckMoney — selection", () => {
  it("skips a charge under threshold and a payout under threshold", async () => {
    const captured: string[] = [];
    const paid: string[] = [];
    const { logged, log } = recorder();

    const report = await sweepStuckMoney({
      now: () => NOW,
      log,
      findCompletedRidesWithUnsettledCharge: async () => [
        { rideId: "fresh", status: "authorized", completedAt: minutesBefore(2) },
      ],
      captureCharge: async (rideId) => {
        captured.push(rideId);
        return { ok: true };
      },
      findPendingPayouts: async () => [
        { payoutId: "fresh", status: "pending", updatedAt: minutesBefore(5) },
      ],
      settlePayout: async (payoutId) => {
        paid.push(payoutId);
        return { ok: true };
      },
    });

    assert.deepEqual(captured, []);
    assert.deepEqual(paid, []);
    assert.deepEqual(report, {
      chargesCaptured: 0,
      chargesStillStuck: 0,
      payoutsSent: 0,
      payoutsStillPending: 0,
    });
    assert.deepEqual(logged, []);
  });

  it("retries a genuinely stuck charge and a genuinely stuck payout", async () => {
    const captured: string[] = [];
    const paid: string[] = [];

    const report = await sweepStuckMoney({
      now: () => NOW,
      findCompletedRidesWithUnsettledCharge: async () => [
        { rideId: "stuck", status: "authorized", completedAt: minutesBefore(30) },
      ],
      captureCharge: async (rideId) => {
        captured.push(rideId);
        return { ok: true };
      },
      findPendingPayouts: async () => [
        { payoutId: "stuck", status: "pending", updatedAt: minutesBefore(60) },
      ],
      settlePayout: async (payoutId) => {
        paid.push(payoutId);
        return { ok: true };
      },
    });

    assert.deepEqual(captured, ["stuck"]);
    assert.deepEqual(paid, ["stuck"]);
    assert.equal(report.chargesCaptured, 1);
    assert.equal(report.payoutsSent, 1);
  });

  it("never calls captureCharge or settlePayout for a 'failed' or 'authorizing' row", async () => {
    const captured: string[] = [];
    const paid: string[] = [];

    const report = await sweepStuckMoney({
      now: () => NOW,
      log: () => {},
      findCompletedRidesWithUnsettledCharge: async () => [
        { rideId: "authorizing", status: "authorizing", completedAt: minutesBefore(1000) },
      ],
      captureCharge: async (rideId) => {
        captured.push(rideId);
        return { ok: true };
      },
      findPendingPayouts: async () => [
        { payoutId: "failed", status: "failed", updatedAt: minutesBefore(1000) },
      ],
      settlePayout: async (payoutId) => {
        paid.push(payoutId);
        return { ok: true };
      },
    });

    assert.deepEqual(captured, []);
    assert.deepEqual(paid, []);
    assert.equal(report.chargesStillStuck, 1); // the authorizing row, reported not retried
    assert.equal(report.payoutsStillPending, 0); // a failed row is not even counted as pending
  });
});

describe("sweepStuckMoney — one row failing must not stop the rest", () => {
  it("keeps attempting later charges after an earlier one returns ok:false", async () => {
    const attempted: string[] = [];

    const report = await sweepStuckMoney({
      now: () => NOW,
      log: () => {},
      findCompletedRidesWithUnsettledCharge: async () => [
        { rideId: "first", status: "authorized", completedAt: minutesBefore(30) },
        { rideId: "second", status: "authorized", completedAt: minutesBefore(30) },
      ],
      captureCharge: async (rideId): Promise<SweepAttemptOutcome> => {
        attempted.push(rideId);
        return rideId === "first" ? { ok: false, message: "card network down" } : { ok: true };
      },
      findPendingPayouts: async () => [],
      settlePayout: async () => ({ ok: true }),
    });

    assert.deepEqual(attempted, ["first", "second"]);
    assert.equal(report.chargesCaptured, 1);
    assert.equal(report.chargesStillStuck, 1);
  });

  it("keeps attempting later payouts after an earlier one throws", async () => {
    const attempted: string[] = [];

    const report = await sweepStuckMoney({
      now: () => NOW,
      log: () => {},
      findCompletedRidesWithUnsettledCharge: async () => [],
      captureCharge: async () => ({ ok: true }),
      findPendingPayouts: async () => [
        { payoutId: "first", status: "pending", updatedAt: minutesBefore(60) },
        { payoutId: "second", status: "pending", updatedAt: minutesBefore(60) },
      ],
      settlePayout: async (payoutId): Promise<SweepAttemptOutcome> => {
        attempted.push(payoutId);
        if (payoutId === "first") throw new Error("stripe timeout");
        return { ok: true };
      },
    });

    assert.deepEqual(attempted, ["first", "second"]);
    assert.equal(report.payoutsSent, 1);
    assert.equal(report.payoutsStillPending, 1);
  });

  it("logs the still-stuck row rather than throwing out of the sweep itself", async () => {
    const { logged, log } = recorder();

    await sweepStuckMoney({
      now: () => NOW,
      log,
      findCompletedRidesWithUnsettledCharge: async () => [],
      captureCharge: async () => ({ ok: true }),
      findPendingPayouts: async () => [
        { payoutId: "poisoned", status: "pending", updatedAt: minutesBefore(60) },
      ],
      settlePayout: async () => {
        throw new Error("stripe timeout");
      },
    });

    assert.equal(logged.length, 1);
    assert.match(logged[0] ?? "", /settlePayout threw/);
  });
});

describe("sweepStuckMoney — ordering", () => {
  // ADR-0017's capture-before-payout, extended to the retry path: the rare row stuck on both
  // ledgers for the same ride must still capture before that ride's payout is attempted.
  it("captures every stuck charge before attempting any stuck payout", async () => {
    const calls: string[] = [];

    await sweepStuckMoney({
      now: () => NOW,
      log: () => {},
      findCompletedRidesWithUnsettledCharge: async () => [
        { rideId: "r1", status: "authorized", completedAt: minutesBefore(30) },
      ],
      captureCharge: async () => {
        calls.push("capture");
        return { ok: true };
      },
      findPendingPayouts: async () => [
        { payoutId: "p1", status: "pending", updatedAt: minutesBefore(60) },
      ],
      settlePayout: async () => {
        calls.push("payout");
        return { ok: true };
      },
    });

    assert.deepEqual(calls, ["capture", "payout"]);
  });
});

describe("sweepStuckMoney — the happy path stays quiet", () => {
  it("logs nothing when every stuck row clears", async () => {
    const { logged, log } = recorder();

    const report = await sweepStuckMoney({
      now: () => NOW,
      log,
      findCompletedRidesWithUnsettledCharge: async () => [
        { rideId: "r1", status: "authorized", completedAt: minutesBefore(30) },
      ],
      captureCharge: async () => ({ ok: true }),
      findPendingPayouts: async () => [
        { payoutId: "p1", status: "pending", updatedAt: minutesBefore(60) },
      ],
      settlePayout: async () => ({ ok: true }),
    });

    assert.deepEqual(logged, []);
    assert.deepEqual(report, {
      chargesCaptured: 1,
      chargesStillStuck: 0,
      payoutsSent: 1,
      payoutsStillPending: 0,
    });
  });
});
