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

const NOT_CONFIGURED = "Payouts aren't configured. Set STRIPE_SECRET_KEY in .env.local.";

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
  /** The `driver_payouts` row id. Doubles as Stripe's idempotency key — see below. */
  readonly payoutId: string;
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
 * **The idempotency key is the payout row's id**, which makes a duplicate transfer impossible from
 * two directions at once: Postgres will not let two ledger rows exist for one ride
 * (`driver_payouts_one_per_ride`), and Stripe will not create two transfers for one key even if
 * this function is somehow called twice for the same row — a retry, a double-tap, two server
 * instances. Duplicate-paying a driver is the one failure here that costs real cash and cannot be
 * undone by a database rollback, so it is prevented in two systems that fail independently.
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
      { idempotencyKey: `rido_payout_${request.payoutId}` },
    );
    return { ok: true, transferId: transfer.id };
  } catch (error) {
    const { message, retryable } = classifyError(error);
    return { ok: false, message, retryable };
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
