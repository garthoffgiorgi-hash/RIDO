/**
 * What happens to the money after a ride is already completed: capture the rider's fare, then pay
 * the driver — in that order, with neither failure able to affect the caller.
 *
 * Pure in the sense that matters here: it does no I/O of its own and takes the two steps as
 * arguments, so both properties below can be proved without Stripe or a database. The real
 * `captureRideCharge`/`payoutRide` calls are wired in by `(driver)/drive/actions.ts`.
 *
 * **Capture strictly before payout (ADR-0017).** The capture is what puts real funds in RIDO's
 * platform balance, and the transfer draws on that balance. Reversed, the payout asks for money
 * the capture has not yet brought in — which is exactly the `balance_insufficient` failure ADR-0015
 * documented as the expected production case and that rider charging exists to end.
 *
 * **Neither failure may propagate.** The ride is finished either way, the commission snapshot is
 * written either way, and the driver is owed either way — `queue_driver_payout` recorded that debt
 * inside the completion transaction before this ever ran. So a throw here must not turn a
 * completed ride into a failed one on the driver's screen. The two ledgers are what remember: an
 * uncaptured charge stays `authorized` and retryable, an unsent payout stays `pending`.
 *
 * The honest cost, worth naming because nothing else does: with no sweep and no alerting, a
 * swallowed failure here is invisible until someone looks at the ledger. That is a known gap, not
 * an accident — logging is the whole of the current story.
 */
export interface MoneySteps {
  /** Captures the rider's fare. Funds the balance the payout draws on, so it goes first. */
  readonly capture: () => Promise<unknown>;
  /** Transfers the driver's snapshotted `driver_payout_cents`. */
  readonly payout: () => Promise<unknown>;
  /** Where a swallowed failure goes. Defaults to `console.error`, the repo's current whole story. */
  readonly log?: (message: string, cause: unknown) => void;
}

export async function settleCompletedRide(steps: MoneySteps): Promise<void> {
  const log = steps.log ?? ((message, cause) => console.error(message, cause));

  try {
    await steps.capture();
  } catch (cause) {
    log("payments: captureRideCharge threw after a successful completion", cause);
  }

  try {
    await steps.payout();
  } catch (cause) {
    // Swallowed for the same reason as the capture above — and still attempted even when the
    // capture failed. The driver is owed regardless of whether RIDO managed to collect yet, and
    // the platform balance may well cover it from other rides.
    log("payouts: payoutRide threw after a successful completion", cause);
  }
}
