/**
 * Whether a rider may cancel, and what it costs them.
 *
 * `canRiderCancel()` in `./status.ts` used to answer the first half alone, and its docstring said
 * why it stopped there: *"whether a rider can still cancel after a driver has committed is a real
 * product decision (a fee? a driver notification?) that belongs with that PR, not assumed here."*
 * Accept shipped (ADR-0013), charging ships now, so this is that decision — ADR-0018.
 *
 * Pure, like every other rule in this directory. **`now` is an argument, never `Date.now()`**:
 * the grace window is the one boundary in this feature a rider could be a second on either side
 * of, and a rule that reads the clock itself cannot be tested at that boundary. Same discipline
 * `packages/pricing` enforces for tiers and month-to-date position.
 *
 * The fee and the window are both DATA, read from `fare_rate_cards` by the caller and passed in —
 * this file names neither, exactly as `commission.ts` names no rate.
 */

import type { RideStatus } from "./status.ts";

export type CancellationOutcome =
  /** Cancel freely: the hold is released in full and nobody is owed anything. */
  | { readonly kind: "free" }
  /** Cancel, but capture this much from the hold the rider already placed. */
  | { readonly kind: "fee"; readonly feeCents: number }
  /** Not cancellable at all — the ride is already over, one way or another. */
  | { readonly kind: "forbidden" };

export interface CancellationInput {
  readonly status: RideStatus;
  /** `rides.accepted_at`. Null while nobody has accepted, which is why a free cancel needs no clock. */
  readonly acceptedAt: string | null;
  readonly now: Date;
  /** `fare_rate_cards.cancellation_grace_seconds`. */
  readonly graceSeconds: number;
  /** `fare_rate_cards.cancellation_fee_cents`. Zero disables the fee for this market. */
  readonly feeCents: number;
}

/**
 * What happens if this rider cancels right now.
 *
 * The rules, and why each is where it is:
 *
 *   `requested`   → free. Nobody has been dispatched and nobody has driven anywhere, so there is
 *                   nothing to compensate. This is the case that was already true before ADR-0018.
 *   `accepted`    → free inside the grace window, fee outside it. A driver has committed and is
 *                   moving; the window exists so a mistap isn't a charge.
 *   `in_progress` → fee, with no grace at all. The rider is in the car. There is no version of
 *                   this where the driver's time hasn't been spent.
 *   otherwise     → forbidden. A completed ride is finished business and a canceled one is
 *                   already canceled; both would be nonsense to cancel and `cancelRide()` refuses.
 *
 * A zero `feeCents` collapses to `free` rather than a fee of nothing: a market that has not set a
 * fee should not send a rider a confirmation dialog about being charged $0.00.
 */
export function cancellationOutcome(input: CancellationInput): CancellationOutcome {
  const { status, acceptedAt, now, graceSeconds, feeCents } = input;

  if (status === "completed" || status === "canceled") {
    return { kind: "forbidden" };
  }

  if (status === "requested") {
    return { kind: "free" };
  }

  // A fee nobody configured is not a fee.
  if (feeCents <= 0) {
    return { kind: "free" };
  }

  if (status === "accepted") {
    // No accepted_at means the row is inconsistent with its own status — the database's
    // rides_driver_present_unless_pending would have caught a driverless 'accepted' ride, but
    // nothing enforces the timestamp. Treat the window as un-started and let them cancel free:
    // charging on the strength of a missing timestamp is the wrong way to resolve an ambiguity
    // about someone's money.
    if (acceptedAt === null) return { kind: "free" };

    const acceptedMs = Date.parse(acceptedAt);
    if (Number.isNaN(acceptedMs)) return { kind: "free" };

    const elapsedSeconds = (now.getTime() - acceptedMs) / 1000;
    if (elapsedSeconds <= graceSeconds) return { kind: "free" };

    return { kind: "fee", feeCents };
  }

  // in_progress
  return { kind: "fee", feeCents };
}
