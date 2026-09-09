/**
 * What a Stripe `payment_intent.*` webhook event means for the `ride_charges` ledger, as a pure
 * function. **This is the code that decides what a payment row says about a rider's money**, so it
 * is worth being able to test every branch of it without a Stripe account or a database.
 *
 * Pure — no I/O, no SDK. The verification, the dispatch and the write live in
 * `apps/web/src/app/api/stripe/webhook/route.ts` and `./server.ts` respectively.
 *
 * Deliberately takes `ChargeIntentFacts` rather than a `Stripe.PaymentIntent`: the same reasoning
 * `rides/accept.ts` gives for not taking a `DriverProfile`. Depending on the vendor type here would
 * drag the Stripe SDK's types past `stripe/server.ts` — the one file allowed to import them
 * (ADR-0006, and `scripts/check-context.mjs` rule 7) — and would make every fixture below a
 * hundred-field object to assert one status.
 */

/** The two fields of a PaymentIntent this rule reads. The route narrows to these at the boundary. */
export interface ChargeIntentFacts {
  /** Stripe's `amount_received`, in integer cents. */
  readonly amountReceived: number | null;
  /** Stripe's `last_payment_error.message`, if the intent carries one. */
  readonly failureMessage: string | null;
}

/**
 * The arguments `syncChargeFromWebhook` takes, decided here rather than inline at the call site.
 * A subset of `ChargeStatus` (`./server.ts`): `authorizing` is never a webhook outcome — it is the
 * state the app writes itself before Stripe has said anything.
 */
export interface ChargeUpdate {
  readonly status: "authorized" | "captured" | "voided" | "failed";
  readonly capturedCents: number | null;
  readonly failureReason: string | null;
}

/**
 * The update a `payment_intent.*` event implies, or `null` if the event isn't one this ledger
 * tracks (`account.updated`, or anything unrecognised — the route's own `HANDLED` set is the
 * dispatch gate; this is the mapping).
 *
 * **`capturedCents` is set on `captured` and nowhere else.** A voided hold or a failed charge that
 * recorded an amount would be a ledger row claiming money moved when it didn't; the branches below
 * are what keep that impossible rather than a habit of passing `null` at the call site.
 *
 * `amount_capturable_updated` → `authorized` is the load-bearing one: it fires on every successful
 * manual-capture authorization, so it is an idempotent no-op on the synchronous path — but on the
 * `requires_action` (3DS) path it is the ONLY thing that ever writes `authorized`, because the
 * browser resolves that challenge with Stripe directly and no server round trip sees it.
 */
export function chargeUpdateFromEvent(
  eventType: string,
  facts: ChargeIntentFacts,
): ChargeUpdate | null {
  const status = statusForEvent(eventType);
  if (status === null) return null;

  return {
    status,
    capturedCents: status === "captured" ? facts.amountReceived : null,
    failureReason: facts.failureMessage,
  };
}

function statusForEvent(eventType: string): ChargeUpdate["status"] | null {
  switch (eventType) {
    case "payment_intent.amount_capturable_updated":
      return "authorized";
    case "payment_intent.succeeded":
      return "captured";
    case "payment_intent.canceled":
      return "voided";
    case "payment_intent.payment_failed":
      return "failed";
    default:
      return null;
  }
}
