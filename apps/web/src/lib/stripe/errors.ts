/**
 * Stripe failures, restated in RIDO's voice: what happened and what to do, no apology and no
 * blame (`brand/brand-guide.md`). Same shape and same trade-offs as `src/lib/maps/errors.ts`.
 *
 * **The case this file exists for: `balance_insufficient`.** Until rider charging ships, nothing
 * funds RIDO's platform balance, so every production transfer fails with exactly that code
 * (ADR-0015). It is not a driver problem, not a bug they can act on, and emphatically not a
 * reason to believe their money is gone — the `driver_payouts` row is still there, still owed,
 * still retryable. Rendering Stripe's own wording ("Insufficient funds in your Stripe balance")
 * to a driver would be the single most alarming string in the product.
 *
 * The second reason: Stripe errors are *typed* (`StripeCardError`, `StripeInvalidRequestError`,
 * ...) and separately *coded*, and which of the two carries the meaning varies by failure. So
 * both are inputs here, and neither is trusted alone.
 */

export interface StripeErrorInput {
  /** Stripe's error `type`, e.g. `StripeInvalidRequestError`, `StripeConnectionError`. */
  readonly type?: string;
  /** Stripe's error `code`, e.g. `balance_insufficient`, `account_invalid`. */
  readonly code?: string;
  /** The raw message, for the dev-only detail. Never shown in production. */
  readonly raw?: string;
}

export interface StripeFailure {
  readonly message: string;
  /** Whether trying the same call again could plausibly succeed without anything else changing. */
  readonly retryable: boolean;
}

const GENERIC = "Something went wrong talking to Stripe. Try again in a moment.";

/** Appends the raw detail outside production, the way `maps/errors.ts` does. */
function withDetail(message: string, raw: string | undefined): string {
  return process.env.NODE_ENV === "production" || !raw ? message : `${message} (dev: ${raw})`;
}

export function stripeErrorMessage(input: StripeErrorInput): StripeFailure {
  const { type, code, raw } = input;

  if (process.env.NODE_ENV !== "production") {
    console.warn("[stripe]", JSON.stringify({ type, code, raw }));
  }

  const c = (code ?? "").toLowerCase();
  const t = (type ?? "").toLowerCase();

  // ---- the expected one, until rider charging exists. Ours, not theirs, and not lost.
  if (c === "balance_insufficient") {
    return {
      message:
        "This payout is queued. RIDO doesn't have the funds settled to send it yet — your earnings are recorded and will be sent automatically.",
      // True in the sense that matters: the same call will succeed once the balance is funded,
      // with nothing about this payout needing to change.
      retryable: true,
    };
  }

  // ---- the driver's Connect account isn't ready. Actionable, by them.
  if (c === "account_invalid" || c === "account_closed") {
    return {
      message: "Your payout account isn't set up yet. Connect your bank to receive earnings.",
      retryable: false,
    };
  }

  // ---- configuration failures. Ours, and a driver can do nothing about them, so say so plainly
  //      rather than implying they should try something.
  if (t === "stripeauthenticationerror" || c === "api_key_expired") {
    return {
      message: "Payouts aren't configured. Check STRIPE_SECRET_KEY in .env.local.",
      retryable: false,
    };
  }
  if (t === "stripepermissionerror") {
    return {
      message: withDetail("This Stripe key isn't allowed to do that. This one's ours to fix.", raw),
      retryable: false,
    };
  }
  if (t === "stripeinvalidrequesterror") {
    return {
      message: withDetail("That payout request wasn't valid. This one's ours to fix.", raw),
      retryable: false,
    };
  }

  // ---- load and transport. Retryable, and nothing is wrong with the payout itself.
  if (t === "striperatelimiterror" || c === "rate_limit") {
    return {
      message: "Too many requests to Stripe right now. Try again in a moment.",
      retryable: true,
    };
  }
  if (t === "stripeconnectionerror" || t === "stripeapierror") {
    return { message: "Couldn't reach Stripe. Try again in a moment.", retryable: true };
  }

  // ---- the request never left this server.
  const m = (raw ?? "").toLowerCase();
  if (m.includes("timeout") || m.includes("timed out") || m.includes("abort")) {
    return { message: "Stripe took too long to answer. Try again.", retryable: true };
  }
  if (m.includes("failed to fetch") || m.includes("econnrefused") || m.includes("enotfound")) {
    return {
      message: "Couldn't reach Stripe. Check the server's network connection.",
      retryable: true,
    };
  }

  // Unknown. Retryable is the safer default for a payout: the ledger row survives either way, and
  // a retry that fails again is cheap, whereas wrongly marking something permanently failed
  // strands a driver's money behind a manual intervention.
  return { message: withDetail(GENERIC, raw), retryable: true };
}
