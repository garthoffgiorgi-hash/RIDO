/**
 * Which rows a scheduled sweep should retry, and the retry itself — pure, in the sense that
 * matters: it does no I/O of its own and takes both the candidates and the retry steps as
 * arguments, so every property below is provable without Stripe, Postgres, or a clock nobody
 * controls. The real queries and the real `captureRideCharge`/`settlePayoutForSweep` calls are
 * wired in by `./sweep.ts`. ADR-0025.
 *
 * **This is `settleCompletedRide`'s shape, applied to "later" instead of "now".** That function
 * proved capture-then-payout with neither failure able to affect the caller; this proves the same
 * ordering across every stuck row on both ledgers, plus the property a single ride never needed:
 * one row failing must not stop the rest.
 *
 * **The thing this file must never do, no matter how the queries change: touch a `'failed'`
 * row.** `settle()`'s own docstring in `../payouts/server.ts` draws the line — `pending` is "owed,
 * not sent... none is an error state a person needs to look at," `failed` is "tried, and refused
 * terminally. Something needs a human." `captureCharge()` draws the identical line. An automated
 * process that blurred `failed` back into `pending` would be the same failure ADR-0016 fixed, in
 * the opposite direction — making a terminal row look retryable rather than a retryable one look
 * terminal. So `status` rides along on every candidate and is checked HERE, in the pure layer, not
 * assumed from whatever a SQL `WHERE` clause currently says — a query that quietly widened later
 * must not silently start retrying rows this file exists to leave alone.
 */

/** 15 minutes: operational headroom over a transient failure plus its own retry, not a business
 * rule — capture is synchronous inside `completeRide()`, so this is never waiting on a webhook. */
const CHARGE_STUCK_AFTER_MS = 15 * 60 * 1000;

/** 30 minutes: generous specifically because a `pending` row for a driver who hasn't finished
 * Connect onboarding is EXPECTED to sit that way by design — re-sweeping it costs a claim RPC, not
 * a Stripe call, since `canReceiveTransfers` is checked locally first. */
const PAYOUT_STUCK_AFTER_MS = 30 * 60 * 1000;

export interface StuckChargeCandidate {
  readonly rideId: string;
  /**
   * `'authorized'` is capturable and swept. `'authorizing'` means no valid authorization exists
   * yet — a 3DS challenge the rider never finished, or a webhook that never arrived to promote it
   * — a different, unhandled problem with no action defined here; it is reported, never acted on.
   */
  readonly status: "authorized" | "authorizing";
  readonly completedAt: string;
}

export interface StuckPayoutCandidate {
  readonly payoutId: string;
  /** Whatever the caller's query returns — checked here regardless, per this file's header. */
  readonly status: "pending" | "failed" | "paid";
  readonly updatedAt: string;
}

/** `false` for anything but `'authorized'` — an `'authorizing'` row is reported by the caller, not retried here. */
export function isCaptureStuck(candidate: StuckChargeCandidate, now: Date): boolean {
  if (candidate.status !== "authorized") return false;
  return now.getTime() - new Date(candidate.completedAt).getTime() >= CHARGE_STUCK_AFTER_MS;
}

/** `false` for anything but `'pending'` — `'failed'` and `'paid'` are never retried, regardless of age. */
export function isPayoutStuck(candidate: StuckPayoutCandidate, now: Date): boolean {
  if (candidate.status !== "pending") return false;
  return now.getTime() - new Date(candidate.updatedAt).getTime() >= PAYOUT_STUCK_AFTER_MS;
}

/** One retry attempt's outcome, simplified to what this file needs: did it clear. */
export interface SweepAttemptOutcome {
  readonly ok: boolean;
  readonly message?: string;
}

export interface SweepSteps {
  readonly findCompletedRidesWithUnsettledCharge: () => Promise<readonly StuckChargeCandidate[]>;
  readonly captureCharge: (rideId: string) => Promise<SweepAttemptOutcome>;
  readonly findPendingPayouts: () => Promise<readonly StuckPayoutCandidate[]>;
  readonly settlePayout: (payoutId: string) => Promise<SweepAttemptOutcome>;
  /** Defaults to `() => new Date()`. Injectable so a threshold boundary is provable without a clock. */
  readonly now?: () => Date;
  /** Where a still-stuck row goes. Defaults to `console.error`, matching `settlement.ts`'s posture. */
  readonly log?: (message: string, detail: unknown) => void;
}

export interface SweepReport {
  readonly chargesCaptured: number;
  /** Includes both a failed retry and an `'authorizing'` row flagged for visibility. */
  readonly chargesStillStuck: number;
  readonly payoutsSent: number;
  readonly payoutsStillPending: number;
}

/**
 * Runs both sweeps in one pass: charges to completion, then payouts — preserving ADR-0017's
 * capture-before-payout on the rare row stuck on both ledgers for the same ride, without forcing
 * every candidate through `settleCompletedRide`'s full two-step shape.
 *
 * **A thrown or failed attempt never stops the loop.** The same promise
 * `settlePendingPayoutsForDriver`'s docstring already makes ("One row failing... must not stop the
 * rest"), now actually proved rather than merely stated, and extended to a row that throws instead
 * of returning a failure.
 *
 * Stays quiet on a cleared row — logs only what is still stuck after this pass, the same
 * quiet-happy-path posture `settleCompletedRide` already keeps.
 */
export async function sweepStuckMoney(steps: SweepSteps): Promise<SweepReport> {
  const now = steps.now ?? (() => new Date());
  const log = steps.log ?? ((message, detail) => console.error(message, detail));

  let chargesCaptured = 0;
  let chargesStillStuck = 0;

  for (const charge of await steps.findCompletedRidesWithUnsettledCharge()) {
    if (charge.status === "authorizing") {
      chargesStillStuck++;
      log("ops/sweep: a completed ride's charge never left 'authorizing'", {
        rideId: charge.rideId,
      });
      continue;
    }

    if (!isCaptureStuck(charge, now())) continue;

    try {
      const result = await steps.captureCharge(charge.rideId);
      if (result.ok) {
        chargesCaptured++;
      } else {
        chargesStillStuck++;
        log("ops/sweep: a capture retry did not clear the charge", {
          rideId: charge.rideId,
          message: result.message,
        });
      }
    } catch (cause) {
      chargesStillStuck++;
      log("ops/sweep: captureCharge threw during a sweep", { rideId: charge.rideId, cause });
    }
  }

  let payoutsSent = 0;
  let payoutsStillPending = 0;

  for (const payout of await steps.findPendingPayouts()) {
    if (!isPayoutStuck(payout, now())) continue;

    try {
      const result = await steps.settlePayout(payout.payoutId);
      if (result.ok) {
        payoutsSent++;
      } else {
        payoutsStillPending++;
        log("ops/sweep: a payout retry did not clear", {
          payoutId: payout.payoutId,
          message: result.message,
        });
      }
    } catch (cause) {
      payoutsStillPending++;
      log("ops/sweep: settlePayout threw during a sweep", { payoutId: payout.payoutId, cause });
    }
  }

  return { chargesCaptured, chargesStillStuck, payoutsSent, payoutsStillPending };
}
