/**
 * What a Stripe Connect account's flags mean for a driver, as a pure function.
 *
 * Stripe reports account state as several booleans plus a requirements object, and the mapping to
 * "what should this driver be told" is not one-to-one. In particular `details_submitted &&
 * !payouts_enabled` is a real, common, and temporary state — the driver finished the form and
 * Stripe is verifying — and it must not be shown as either "you haven't started" (wrong, and
 * insulting after they just did it) or "you're all set" (wrong, and a promise we can't keep).
 * That distinction is the reason this file exists rather than a boolean on the caller.
 *
 * Pure — no SDK import, no I/O, safe to test without a Stripe account. The SDK lives in
 * `./server.ts`.
 */

export type ConnectStatus =
  /** No Stripe account exists for this driver yet. They have never started onboarding. */
  | "not_started"
  /** An account exists but the hosted form isn't finished. Resumable from where they left off. */
  | "incomplete"
  /** Form submitted, Stripe still verifying. Nothing for the driver to do but wait. */
  | "pending_verification"
  /** Payouts enabled. Transfers will land. */
  | "enabled"
  /** Stripe is blocking payouts and wants something — usually more documentation. */
  | "restricted";

/**
 * The subset of a Stripe `Account` this decision needs. Declared structurally rather than
 * importing Stripe's own type so this module stays free of the SDK — the caller in `server.ts`
 * passes the real object, which satisfies this shape.
 */
export interface ConnectAccountFacts {
  readonly payoutsEnabled: boolean;
  readonly detailsSubmitted: boolean;
  /** `requirements.currently_due` — what Stripe wants before it will act. */
  readonly currentlyDue: readonly string[];
  /** `requirements.disabled_reason` — non-null when Stripe has actively disabled the account. */
  readonly disabledReason: string | null;
}

/**
 * Maps Stripe's account state to what RIDO should do and say about it.
 *
 * `null` means no account id is stored for this driver at all — distinct from an account that
 * exists but is unfinished, because only the former needs creating rather than resuming.
 */
export function connectStatus(facts: ConnectAccountFacts | null): ConnectStatus {
  if (facts === null) return "not_started";

  // Checked before payoutsEnabled: an account can briefly report both, and a disabled_reason is
  // the more urgent fact — it is the one that needs the driver to go do something.
  if (facts.disabledReason !== null) return "restricted";

  if (facts.payoutsEnabled) return "enabled";

  // Submitted but not yet enabled, and Stripe isn't asking for anything: it's verifying. The
  // driver has no action to take, which is the whole point of separating this from "incomplete".
  if (facts.detailsSubmitted && facts.currentlyDue.length === 0) return "pending_verification";

  return "incomplete";
}

/** Whether a transfer may be attempted. The one question the payout path actually asks. */
export function canReceiveTransfers(status: ConnectStatus): boolean {
  return status === "enabled";
}

/**
 * What to tell the driver, in RIDO's voice — plain, no apology, says what happens next
 * (`brand/brand-guide.md`).
 */
export function connectStatusMessage(status: ConnectStatus): string {
  switch (status) {
    case "not_started":
      return "Connect your bank to get paid for the rides you drive.";
    case "incomplete":
      return "Your payout setup isn't finished. Pick up where you left off.";
    case "pending_verification":
      return "Stripe is verifying your details. Your earnings are safe and will be sent once that clears.";
    case "enabled":
      return "Your bank is connected. Earnings are sent after each ride.";
    case "restricted":
      return "Stripe needs more information before it can pay you. Your earnings are safe in the meantime.";
  }
}
