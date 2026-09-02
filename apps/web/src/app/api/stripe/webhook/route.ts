import { type NextRequest, NextResponse } from "next/server";
import { syncChargeFromWebhook } from "@/lib/payments/server";
import { syncConnectAccountFromWebhook } from "@/lib/payouts/server";
import {
  type StripeAccount,
  type StripePaymentIntent,
  verifyWebhookSignature,
} from "@/lib/stripe/server";

/**
 * Stripe's webhook endpoint — the first `api/` route in this app.
 *
 * Thin by design, like `auth/confirm` and `auth/signout`: it verifies, dispatches, and answers.
 * Every decision lives in `src/lib/`, and the Stripe SDK is never imported here —
 * `scripts/check-context.mjs` rule 7 fails the build on a vendor SDK imported outside `src/lib/`,
 * which is exactly the rule that keeps a webhook handler from quietly becoming a second place
 * Stripe logic lives.
 *
 * **This endpoint is unauthenticated by session and that is correct.** Stripe has no RIDO login;
 * it proves identity by signing the request body with a secret only Stripe and this server hold.
 * `src/proxy.ts` excludes `api/stripe` from session refresh for that reason — see the comment on
 * its matcher.
 *
 * Deployment note: the signing secret is **per endpoint**, so the one from `stripe listen` locally
 * and the one from the deployed endpoint's dashboard page are different values. Using the wrong
 * one fails every request with a signature error, which is the intended, loud outcome.
 */

/**
 * Which events actually change something here. Anything else is acknowledged and ignored — Stripe
 * lets you subscribe broadly, and a 2xx on an event we don't act on is correct: it means
 * "received", not "handled", and returning an error would make Stripe retry something that will
 * never do anything.
 */
const HANDLED = new Set([
  "account.updated",
  "payment_intent.amount_capturable_updated",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
]);

export async function POST(request: NextRequest) {
  // The RAW body. `constructEvent` hashes the exact bytes Stripe signed, so parsing to JSON and
  // re-serialising — even to something semantically identical — fails verification. This is the
  // single most common way a Stripe webhook is gotten wrong.
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  const verified = verifyWebhookSignature(rawBody, signature);
  if (!verified.ok) {
    // 400, not 401: Stripe treats 4xx as "do not retry", which is right for a body that will
    // never verify. The message is deliberately not differentiated between "bad secret" and
    // "forged request" — this endpoint is public, and a helpful error here helps the wrong people.
    console.error("stripe webhook: signature verification failed", { reason: verified.message });
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const event = verified.data;
  if (!HANDLED.has(event.type)) {
    return NextResponse.json({ received: true, handled: false });
  }

  // EVERY handler below writes STATE, never a delta.
  //
  // `account.updated` carries the account's full current state; the three `payment_intent.*` events
  // carry the intent's. Handling any of them sets a row to what Stripe says it is right now, so
  // replaying one — which Stripe does, on its own retry schedule and out of order — converges on
  // the same row either way. That is still why there is no processed-event table here, and rider
  // charging did not change it. **The first handler that applies a DELTA (crediting a balance,
  // incrementing a counter) breaks the property and must add one.**
  if (event.type === "account.updated") {
    const account = event.data.object as StripeAccount;
    const synced = await syncConnectAccountFromWebhook(account);

    if (!synced.ok) {
      // 500 so Stripe retries: the event was genuine and we failed to record it, which is exactly
      // the case its retry schedule exists for.
      console.error("stripe webhook: failed to sync connect account", {
        accountId: account.id,
        reason: synced.message,
      });
      return NextResponse.json({ error: "Could not record that update." }, { status: 500 });
    }
  }

  if (
    event.type === "payment_intent.amount_capturable_updated" ||
    event.type === "payment_intent.succeeded" ||
    event.type === "payment_intent.payment_failed" ||
    event.type === "payment_intent.canceled"
  ) {
    const intent = event.data.object as StripePaymentIntent;

    // The app already records these when it makes the call itself — this is reconciliation, for
    // the cases the app never saw: a rider who completed a 3DS challenge after closing the tab, a
    // hold Stripe expired on its own a week later, a capture whose response was lost in transit.
    // `amount_capturable_updated` fires on every successful manual-capture authorization, so it is
    // an idempotent no-op on the synchronous no-3DS path — but on the `requires_action` path it is
    // the ONLY thing that ever writes `authorized`: `completeAuthorization()` resolves the challenge
    // with Stripe directly from the browser, with no server round trip to write it there instead.
    const status =
      event.type === "payment_intent.amount_capturable_updated"
        ? ("authorized" as const)
        : event.type === "payment_intent.succeeded"
          ? ("captured" as const)
          : event.type === "payment_intent.canceled"
            ? ("voided" as const)
            : ("failed" as const);

    const synced = await syncChargeFromWebhook(
      intent.id,
      status,
      status === "captured" ? intent.amount_received : null,
      intent.last_payment_error?.message ?? null,
    );

    if (!synced.ok) {
      console.error("stripe webhook: failed to sync a charge", {
        paymentIntentId: intent.id,
        reason: synced.message,
      });
      return NextResponse.json({ error: "Could not record that update." }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true, handled: true });
}
