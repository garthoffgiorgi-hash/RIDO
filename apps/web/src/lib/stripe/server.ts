import "server-only";

import Stripe from "stripe";
import { type ConnectAccountFacts, connectStatus, type ConnectStatus } from "./account-status.ts";
import { stripeErrorMessage } from "./errors.ts";
import { failed, type StripeResult } from "./result.ts";

/**
 * The Stripe vendor boundary — the ONLY file in this repo permitted to import `stripe`.
 *
 * That is not a convention here, it is enforced: `scripts/check-context.mjs` rule 7 lists
 * `/^stripe$/` and `/^@stripe\//` in `VENDOR_SDKS` and fails the build on an import from anywhere
 * under `apps/web/src/` that isn't `src/lib/`. So the webhook route handler, the payout module and
 * every component reach Stripe through the functions below and receive RIDO-shaped results — a
 * component that cannot receive a Stripe error object cannot render one (ADR-0006).
 *
 * Nothing here decides anything. Account state is interpreted by `./account-status.ts` (pure,
 * tested) and failures are translated by `./errors.ts` (pure, tested); this file does I/O and
 * marshalling only. And no money figure is computed here — a transfer amount arrives as an
 * argument, copied from the `driver_payouts` ledger, which copied it from the ride's snapshot.
 */

/**
 * Pinned, not floating. An unpinned API version means Stripe's next release can change a response
 * shape under a deployed app that never redeployed — for a money path that is not a risk worth
 * the convenience. This is the version `stripe@22.6.0` ships with; bump it deliberately, with the
 * changelog open.
 */
const STRIPE_API_VERSION = "2026-08-26.dahlia";

/**
 * Built per call rather than at module scope, deliberately: reading the key at import time makes
 * every route that transitively imports this file fail to build without Stripe configured, which
 * would break `/request` and `/account` over a payout dependency they don't have. Stripe's client
 * is a thin HTTP wrapper — construction is cheap and holds no connection pool.
 */
function client(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION, typescript: true });
}

// "Payments", not "payouts". This message used to reach only a driver looking at their earnings;
// since rider charging (ADR-0017) the same missing key also fails a rider trying to book, and
// telling them "payouts aren't configured" would be describing a part of the system they have
// nothing to do with.
const NOT_CONFIGURED = "Payments aren't configured. Set STRIPE_SECRET_KEY in .env.local.";

/** Turns anything Stripe threw into a RIDO-shaped failure. Never lets a vendor shape escape. */
function toFailure(error: unknown): StripeResult<never> {
  const e = error as { type?: unknown; code?: unknown; message?: unknown };
  return failed(
    stripeErrorMessage({
      type: typeof e?.type === "string" ? e.type : undefined,
      code: typeof e?.code === "string" ? e.code : undefined,
      raw: typeof e?.message === "string" ? e.message : String(error),
    }).message,
  );
}

/** As `toFailure`, but keeps the retryable flag the caller needs to decide ledger state. */
export function classifyError(error: unknown): { message: string; retryable: boolean } {
  const e = error as { type?: unknown; code?: unknown; message?: unknown };
  return stripeErrorMessage({
    type: typeof e?.type === "string" ? e.type : undefined,
    code: typeof e?.code === "string" ? e.code : undefined,
    raw: typeof e?.message === "string" ? e.message : String(error),
  });
}

/**
 * Creates an Express connected account for a driver.
 *
 * **Express, not Standard or Custom.** Express means Stripe hosts the onboarding form and owns
 * identity verification, bank details and the KYC obligation that comes with them — RIDO never
 * receives, transmits or stores a bank account number, which keeps a whole compliance surface out
 * of this codebase entirely. `email` is passed only so Stripe can contact the driver about their
 * own account.
 */
export async function createConnectAccount(email: string | null): Promise<StripeResult<string>> {
  const stripe = client();
  if (!stripe) return failed(NOT_CONFIGURED);

  try {
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: email ?? undefined,
      // Payouts only. RIDO does not use connected accounts to charge riders — the platform
      // collects (once rider charging exists) and transfers onward, so a connected account never
      // needs card_payments.
      capabilities: { transfers: { requested: true } },
      business_type: "individual",
      settings: {
        payouts: {
          // Stripe's default: it pays out to the driver's bank on its own rolling schedule. RIDO
          // transfers per completed ride into their Stripe balance; when that reaches a bank is
          // Stripe's business, not a scheduler we have to build (ADR-0015).
          schedule: { interval: "daily" },
        },
      },
    });
    return { ok: true, data: account.id };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * A single-use link into Stripe's hosted onboarding.
 *
 * Account links expire in minutes and are consumed on use, so this is called per attempt and its
 * result is never cached or stored — a stale link is a dead end for a driver mid-signup.
 */
export async function createOnboardingLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string,
): Promise<StripeResult<string>> {
  const stripe = client();
  if (!stripe) return failed(NOT_CONFIGURED);

  try {
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      // Where Stripe sends them if the link died before they finished — we mint a fresh one.
      refresh_url: refreshUrl,
      return_url: returnUrl,
    });
    return { ok: true, data: link.url };
  } catch (error) {
    return toFailure(error);
  }
}

export interface ConnectAccountState {
  readonly status: ConnectStatus;
  readonly payoutsEnabled: boolean;
  readonly detailsSubmitted: boolean;
}

/**
 * Stripe's current word on an account. Used to reconcile after onboarding returns, since the
 * `account.updated` webhook and the driver's browser race and either may arrive first.
 */
export async function retrieveAccountState(
  accountId: string,
): Promise<StripeResult<ConnectAccountState>> {
  const stripe = client();
  if (!stripe) return failed(NOT_CONFIGURED);

  try {
    const account = await stripe.accounts.retrieve(accountId);
    return { ok: true, data: accountStateFrom(account) };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Maps a Stripe `Account` onto our own shape. Exported because the webhook handler receives an
 * `Account` in the event payload and must interpret it identically to a freshly retrieved one —
 * two mappings that could drift is exactly the bug this prevents.
 */
export function accountStateFrom(account: Stripe.Account): ConnectAccountState {
  const facts: ConnectAccountFacts = {
    payoutsEnabled: account.payouts_enabled ?? false,
    detailsSubmitted: account.details_submitted ?? false,
    currentlyDue: account.requirements?.currently_due ?? [],
    disabledReason: account.requirements?.disabled_reason ?? null,
  };

  return {
    status: connectStatus(facts),
    payoutsEnabled: facts.payoutsEnabled,
    detailsSubmitted: facts.detailsSubmitted,
  };
}

export interface TransferRequest {
  readonly accountId: string;
  /** Copied from the ledger row, which copied it from the ride's snapshot. Never computed here. */
  readonly amountCents: number;
  /** The `driver_payouts` row id. Half of Stripe's idempotency key — see below. */
  readonly payoutId: string;
  /**
   * From `claim_driver_payout_attempt`, the other half of the idempotency key. A payout id alone
   * would make every retry of the same row replay Stripe's first cached response forever, up to
   * 24 hours, even a stale `balance_insufficient` — this is what makes a genuinely new attempt
   * genuinely new to Stripe.
   */
  readonly attempt: number;
  /** The ride this settles, for reconciliation in the Stripe dashboard. */
  readonly rideId: string | null;
}

/**
 * A transfer's outcome carries `retryable` on the failure branch, unlike every other function
 * here, because the caller writes it into the ledger: a retryable failure leaves a payout
 * `pending` (it will be attempted again) and a terminal one marks it `failed` (a person needs to
 * look). That flag has to come from the original Stripe error — deriving it later from an
 * already-translated message would be guessing at what the error was.
 */
export type TransferOutcome =
  | { readonly ok: true; readonly transferId: string }
  | { readonly ok: false; readonly message: string; readonly retryable: boolean };

/**
 * Sends money to a driver's connected account.
 *
 * **The idempotency key is `<payout id>_<attempt>`**, which makes a duplicate transfer impossible
 * from two directions at once: Postgres will not let two ledger rows exist for one ride
 * (`driver_payouts_one_per_ride`), and `claim_driver_payout_attempt` will not let two concurrent
 * calls for the same row obtain the same attempt number — a retry, a double-tap, two server
 * instances racing settle() all collapse to one attempt, one key, one transfer. Duplicate-paying a
 * driver is the one failure here that costs real cash and cannot be undone by a database rollback,
 * so it is prevented in two systems that fail independently. The attempt number is *why* a payout
 * that failed `balance_insufficient` yesterday can genuinely be retried today, rather than Stripe
 * replaying its cached first response forever — see `20260901130000_add_payout_attempt_claim.sql`.
 *
 * Returns the transfer id, which the caller records on the ledger row. A `paid` row without one is
 * refused by `driver_payouts_transfer_id_iff_paid`.
 */
export async function createTransfer(request: TransferRequest): Promise<TransferOutcome> {
  const stripe = client();
  if (!stripe) return { ok: false, message: NOT_CONFIGURED, retryable: false };

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: request.amountCents,
        currency: "usd",
        destination: request.accountId,
        // Groups the transfer with the charge that funded it, once rider charging exists.
        transfer_group: request.rideId ?? undefined,
        metadata: {
          rido_payout_id: request.payoutId,
          rido_ride_id: request.rideId ?? "",
        },
      },
      { idempotencyKey: `rido_payout_${request.payoutId}_${request.attempt}` },
    );
    return { ok: true, transferId: transfer.id };
  } catch (error) {
    const { message, retryable } = classifyError(error);
    return { ok: false, message, retryable };
  }
}

// ─────────────────────────────────────────────────────────────── taking money IN (ADR-0017)
//
// Everything above moves money OUT to a driver. Everything below takes it in from a rider, which
// is the half that funds the balance the transfers above draw on — until this existed, every
// production transfer failed `balance_insufficient` because nothing had ever funded RIDO.

/**
 * Creates the Stripe Customer a rider's card and charges hang off.
 *
 * Called once per rider, on their first card setup. The id is persisted immediately by the caller;
 * a Customer that exists at Stripe but is recorded nowhere is an orphan that the next attempt
 * would duplicate.
 */
export async function createCustomer(email: string | null): Promise<StripeResult<string>> {
  const stripe = client();
  if (!stripe) return failed(NOT_CONFIGURED);

  try {
    const customer = await stripe.customers.create({
      email: email ?? undefined,
      metadata: { rido_role: "rider" },
    });
    return { ok: true, data: customer.id };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * A client secret the browser uses to collect and save a card, without the card touching RIDO.
 *
 * SetupIntent rather than PaymentIntent because saving a card and charging one are different acts:
 * a rider adds a card at `/account` with no ride in sight, and being charged a cent to prove it
 * works would be both surprising and, at $0, impossible.
 *
 * `usage: "off_session"` describes what the SAVED card must be capable of, not how it is confirmed
 * — RIDO authorizes on-session, with the rider present, but a card saved as on-session-only would
 * be unusable the day a future feature needs to charge without them.
 */
export async function createSetupIntent(customerId: string): Promise<StripeResult<string>> {
  const stripe = client();
  if (!stripe) return failed(NOT_CONFIGURED);

  try {
    const intent = await stripe.setupIntents.create({
      customer: customerId,
      usage: "off_session",
      payment_method_types: ["card"],
    });
    if (!intent.client_secret) {
      return failed("Stripe didn't return a way to collect that card. Try again in a moment.");
    }
    return { ok: true, data: intent.client_secret };
  } catch (error) {
    return toFailure(error);
  }
}

/** What RIDO mirrors about a saved card so `/account` can render without asking Stripe. */
export interface SavedCard {
  readonly paymentMethodId: string;
  readonly brand: string | null;
  readonly last4: string | null;
  readonly expMonth: number | null;
  readonly expYear: number | null;
}

/**
 * Reads back the card a SetupIntent saved, so its display details can be mirrored locally.
 *
 * Deliberately returns only brand/last4/expiry alongside the id. That trio is exactly enough for a
 * rider to recognise their own card and nothing like enough to charge it — and what this function
 * returns is what ends up in RIDO's database, so the narrowness is the point.
 */
export async function retrieveSavedCard(setupIntentId: string): Promise<StripeResult<SavedCard>> {
  const stripe = client();
  if (!stripe) return failed(NOT_CONFIGURED);

  try {
    const intent = await stripe.setupIntents.retrieve(setupIntentId, {
      expand: ["payment_method"],
    });

    const method = intent.payment_method;
    if (!method || typeof method === "string") {
      return failed("That card isn't set up yet. Try adding it again.");
    }

    return {
      ok: true,
      data: {
        paymentMethodId: method.id,
        brand: method.card?.brand ?? null,
        last4: method.card?.last4 ?? null,
        expMonth: method.card?.exp_month ?? null,
        expYear: method.card?.exp_year ?? null,
      },
    };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Unlinks a card from its customer. Called when a rider replaces one, so a detached card cannot
 * be authorized against by a stale reference.
 */
export async function detachPaymentMethod(paymentMethodId: string): Promise<StripeResult<null>> {
  const stripe = client();
  if (!stripe) return failed(NOT_CONFIGURED);

  try {
    await stripe.paymentMethods.detach(paymentMethodId);
    return { ok: true, data: null };
  } catch (error) {
    return toFailure(error);
  }
}

export interface AuthorizationRequest {
  readonly customerId: string;
  readonly paymentMethodId: string;
  /** From `holdAmountCents()` — the rider's total plus the rate card's buffer. Never computed here. */
  readonly amountCents: number;
  readonly rideId: string;
  /** The `ride_charges` row id. Half of the idempotency key. */
  readonly chargeId: string;
  /** From `claim_ride_charge_attempt`. The other half — see ADR-0016. */
  readonly attempt: number;
}

/**
 * The outcome of placing a hold.
 *
 * `requires_action` is its own case rather than a failure: a 3DS challenge is not something going
 * wrong, it is the bank asking the rider a question, and the rider is on screen to answer it. The
 * client secret is what lets the browser finish that conversation.
 */
export type AuthorizationOutcome =
  | { readonly ok: true; readonly paymentIntentId: string; readonly status: "authorized" }
  | {
      readonly ok: true;
      readonly paymentIntentId: string;
      readonly status: "requires_action";
      readonly clientSecret: string;
    }
  | { readonly ok: false; readonly message: string; readonly retryable: boolean };

/**
 * Places a hold on the rider's saved card for a ride they are booking.
 *
 * **`capture_method: "manual"`** is the whole design: this authorizes now and captures at
 * completion, so a rider's money is reserved for the trip they asked for and taken only for the
 * trip they got. An uncaptured hold is released by Stripe on its own if a ride never finishes.
 *
 * **`off_session: false`** — the rider is right there, tapping the button. Confirming on-session
 * means a 3DS challenge is a dialog they can answer rather than a failure they discover later,
 * which removes the entire class of off-session authentication failures from this path.
 *
 * **`transfer_group` closes the circle.** `createTransfer` has set the same value — the ride id —
 * since ADR-0015, under a comment saying it groups a transfer "with the charge that funded it,
 * once rider charging exists". This is that charge.
 *
 * The idempotency key carries the attempt number for the reason ADR-0016 exists: a stable key
 * makes Stripe replay its first cached response for 24 hours, so a retryable failure could never
 * actually be retried.
 */
export async function authorizePayment(
  request: AuthorizationRequest,
): Promise<AuthorizationOutcome> {
  const stripe = client();
  if (!stripe) return { ok: false, message: NOT_CONFIGURED, retryable: false };

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: request.amountCents,
        currency: "usd",
        customer: request.customerId,
        payment_method: request.paymentMethodId,
        // Pinned, not left to the Dashboard's automatic-payment-methods list — RIDO is card-only
        // (ADR-0017), and an enabled redirect-based method there makes Stripe demand a
        // `return_url` this on-session flow has no page to redirect back to.
        payment_method_types: ["card"],
        capture_method: "manual",
        confirm: true,
        off_session: false,
        transfer_group: request.rideId,
        metadata: {
          rido_ride_id: request.rideId,
          rido_charge_id: request.chargeId,
        },
      },
      { idempotencyKey: `rido_charge_${request.chargeId}_${request.attempt}` },
    );

    if (intent.status === "requires_action" || intent.status === "requires_confirmation") {
      if (!intent.client_secret) {
        return {
          ok: false,
          message: "Your bank needs to confirm this payment, but Stripe didn't say how.",
          retryable: true,
        };
      }
      return {
        ok: true,
        paymentIntentId: intent.id,
        status: "requires_action",
        clientSecret: intent.client_secret,
      };
    }

    if (intent.status !== "requires_capture") {
      // Any other status means the hold isn't actually in place — treat it as a failure rather
      // than booking a ride against money that was never reserved.
      return {
        ok: false,
        message: "That card couldn't be held for this ride. Try another card.",
        retryable: false,
      };
    }

    return { ok: true, paymentIntentId: intent.id, status: "authorized" };
  } catch (error) {
    const { message, retryable } = classifyError(error);
    return { ok: false, message, retryable };
  }
}

export interface CaptureRequest {
  readonly paymentIntentId: string;
  /** At or below what was authorized. Stripe refuses more, and so does the ledger's CHECK. */
  readonly amountCents: number;
  readonly chargeId: string;
  readonly attempt: number;
}

export type CaptureOutcome =
  | { readonly ok: true; readonly capturedCents: number }
  | { readonly ok: false; readonly message: string; readonly retryable: boolean };

/**
 * Takes the money that has been on hold since the rider booked.
 *
 * Captures a specific amount rather than the whole hold, because the hold is deliberately larger
 * than the fare (`holdAmountCents`) and a cancellation fee is smaller than both. What isn't
 * captured is released back to the rider by Stripe.
 *
 * The returned figure is Stripe's, not the caller's request — if those ever disagree, the ledger
 * should record what actually moved.
 */
export async function capturePayment(request: CaptureRequest): Promise<CaptureOutcome> {
  const stripe = client();
  if (!stripe) return { ok: false, message: NOT_CONFIGURED, retryable: false };

  try {
    const intent = await stripe.paymentIntents.capture(
      request.paymentIntentId,
      { amount_to_capture: request.amountCents },
      { idempotencyKey: `rido_capture_${request.chargeId}_${request.attempt}` },
    );
    return { ok: true, capturedCents: intent.amount_received };
  } catch (error) {
    const { message, retryable } = classifyError(error);
    return { ok: false, message, retryable };
  }
}

/**
 * Releases a hold in full, taking nothing.
 *
 * A free cancellation. Stripe would eventually release an uncaptured authorization on its own,
 * but "eventually" is up to a week of a rider's credit tied up for a ride that isn't happening,
 * which is not a thing to leave to a timeout.
 */
export async function cancelPayment(paymentIntentId: string): Promise<StripeResult<null>> {
  const stripe = client();
  if (!stripe) return failed(NOT_CONFIGURED);

  try {
    await stripe.paymentIntents.cancel(paymentIntentId);
    return { ok: true, data: null };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Verifies a webhook's signature and returns the event, or fails.
 *
 * **The raw body is required** — `constructEvent` hashes the exact bytes Stripe signed, so a body
 * that has been parsed and re-serialised will not verify even when semantically identical. The
 * route handler reads `request.text()` for precisely this reason.
 *
 * **A missing secret refuses every request rather than trusting any.** Degrading to "unverified is
 * fine when unconfigured" would turn a deploy-time oversight into an endpoint where anyone can
 * assert a driver's payouts are enabled.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
): StripeResult<Stripe.Event> {
  const stripe = client();
  if (!stripe) return failed(NOT_CONFIGURED);

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return failed("Webhooks aren't configured. Set STRIPE_WEBHOOK_SECRET in .env.local.");
  }
  if (!signature) return failed("Missing Stripe signature.");

  try {
    return { ok: true, data: stripe.webhooks.constructEvent(rawBody, signature, secret) };
  } catch (error) {
    // Deliberately not run through stripeErrorMessage: a signature failure is either a
    // misconfigured secret or someone forging events, and neither should get a helpful,
    // differentiated message on a public endpoint.
    return failed(`Signature verification failed: ${(error as Error).message}`);
  }
}

/** Re-exported so callers never import the Stripe namespace to name an event. */
export type StripeEvent = Stripe.Event;
export type StripeAccount = Stripe.Account;
export type StripePaymentIntent = Stripe.PaymentIntent;
