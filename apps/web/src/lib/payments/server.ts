import "server-only";

import type { User } from "@supabase/supabase-js";

import { requireUser } from "@/lib/auth/server";
import {
  authorizePayment,
  cancelPayment,
  capturePayment,
  createCustomer,
  createSetupIntent,
  detachPaymentMethod,
  retrieveSavedCard,
} from "@/lib/stripe/server.ts";
import { createServerClient, createServiceRoleClient } from "@/lib/supabase/server";
import { failed, type PaymentsResult } from "./result.ts";
import type { RideChargeRow, RiderPaymentProfileRow } from "./types.ts";

/**
 * What RIDO holds and takes from a rider, and getting it right.
 *
 * The inbound mirror of `src/lib/payouts/server.ts`. That module answers "what does RIDO owe this
 * driver, and has it been sent"; this one answers "what has RIDO reserved on this rider's card,
 * and has it been taken". Same shape throughout: claim an attempt, act, record what happened,
 * release the claim in a `finally`. ADR-0017.
 *
 * **No money is computed anywhere in this file.** The hold comes from `holdAmountCents()` in
 * `@rido/pricing`, the capture amount is the ride's stored `rider_total_cents`, and a cancellation
 * fee is a stored figure from the rate card. If you find yourself doing arithmetic on a cents value
 * here, it belongs in `packages/pricing` instead (root CLAUDE.md invariant 5).
 *
 * Nothing here imports the Stripe SDK — only `@/lib/stripe/*`, which is the one place allowed to
 * (rule 7, enforced by `scripts/check-context.mjs`).
 */

/**
 * `ride_charges`, `rider_payment_profiles` and the new `fare_rate_cards` columns are not in the
 * generated types yet — see `./types.ts`. These casts are the whole of the bridge, kept at the
 * query boundary so the rows they produce are strongly typed everywhere downstream.
 */
type UntypedClient = {
  // biome-ignore lint/suspicious/noExplicitAny: the generated types predate these migrations; see ./types.ts
  from: (table: string) => any;
  // biome-ignore lint/suspicious/noExplicitAny: the generated types predate these migrations; see ./types.ts
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

/** Every column of `RideChargeRow`, named once so the reads below cannot drift apart. */
const CHARGE_COLUMNS =
  "id, ride_id, rider_id, authorized_cents, captured_cents, status, stripe_payment_intent_id, failure_reason, attempt_count, settling, settling_since, created_at, updated_at";

const PROFILE_COLUMNS =
  "rider_id, stripe_customer_id, default_payment_method_id, card_brand, card_last4, card_exp_month, card_exp_year, created_at, updated_at";

// ─────────────────────────────────────────────────────────────────────── the rider's saved card

export interface PaymentProfile {
  readonly hasCard: boolean;
  readonly brand: string | null;
  readonly last4: string | null;
  readonly expMonth: number | null;
  readonly expYear: number | null;
}

/** The empty profile, for a rider who has never added a card. */
const NO_CARD: PaymentProfile = {
  hasCard: false,
  brand: null,
  last4: null,
  expMonth: null,
  expYear: null,
};

/**
 * What card the signed-in rider has on file, for `/account` and the booking sheet.
 *
 * Reads through the RLS-scoped client: `rider_payment_profiles_select_own` already scopes rows to
 * their rider, so nothing here needs the service role to bypass it.
 *
 * A missing profile is not an error — it is the ordinary state of a rider who has not booked yet,
 * and it is what makes `requestRide` return `needs_card` rather than failing a charge.
 */
export async function getPaymentProfile(user: User): Promise<PaymentProfile> {
  const supabase = (await createServerClient()) as unknown as UntypedClient;

  const { data, error } = await supabase
    .from("rider_payment_profiles")
    .select(PROFILE_COLUMNS)
    .eq("rider_id", user.id)
    .maybeSingle();

  if (error || !data) return NO_CARD;

  const profile = data as RiderPaymentProfileRow;
  return {
    hasCard: profile.default_payment_method_id !== null,
    brand: profile.card_brand,
    last4: profile.card_last4,
    expMonth: profile.card_exp_month,
    expYear: profile.card_exp_year,
  };
}

/**
 * Starts collecting a card: creates the Stripe Customer on first use and returns a client secret
 * the browser can mount an Elements form against.
 *
 * **Refuses if the Customer cannot be persisted**, rather than returning a usable secret for a
 * Customer no row knows about — `startConnectOnboarding()`'s exact posture, and for the same
 * reason: the next attempt would create a second one and the rider would end up with a card
 * attached to a customer this system has no record of.
 */
export async function startCardSetup(): Promise<PaymentsResult<{ clientSecret: string }>> {
  const user = await requireUser();
  const service = createServiceRoleClient() as unknown as UntypedClient;

  const { data: existing } = await service
    .from("rider_payment_profiles")
    .select(PROFILE_COLUMNS)
    .eq("rider_id", user.id)
    .maybeSingle();

  let customerId = (existing as RiderPaymentProfileRow | null)?.stripe_customer_id ?? null;

  if (!customerId) {
    const created = await createCustomer(user.email ?? null);
    if (!created.ok) return failed(created.message);
    customerId = created.data;

    const { error } = await service
      .from("rider_payment_profiles")
      .insert({ rider_id: user.id, stripe_customer_id: customerId });

    if (error) {
      return failed("We couldn't save your payment details. Try again in a moment.");
    }
  }

  const secret = await createSetupIntent(customerId);
  if (!secret.ok) return failed(secret.message);

  return { ok: true, data: { clientSecret: secret.data } };
}

/**
 * Records the card a SetupIntent just saved, after the browser confirmed it.
 *
 * Reads the card back from Stripe rather than trusting anything the client sends: the browser
 * knows the PaymentMethod id, but a client-supplied id is a request to charge someone else's card
 * if it isn't checked, and checking it is exactly what retrieving it from the SetupIntent does.
 *
 * Detaches a card being replaced, so a stale reference cannot be authorized against later.
 */
export async function recordCardFromSetup(setupIntentId: string): Promise<PaymentsResult<null>> {
  const user = await requireUser();
  const service = createServiceRoleClient() as unknown as UntypedClient;

  const card = await retrieveSavedCard(setupIntentId);
  if (!card.ok) return failed(card.message);

  const { data: existing } = await service
    .from("rider_payment_profiles")
    .select(PROFILE_COLUMNS)
    .eq("rider_id", user.id)
    .maybeSingle();

  const profile = existing as RiderPaymentProfileRow | null;
  if (!profile) {
    // The SetupIntent exists but no profile does, which startCardSetup makes impossible. Refuse
    // rather than inventing a profile around a customer id we would have to guess at.
    return failed("We couldn't find your payment details. Try adding the card again.");
  }

  const previous = profile.default_payment_method_id;

  const { error } = await service
    .from("rider_payment_profiles")
    .update({
      default_payment_method_id: card.data.paymentMethodId,
      card_brand: card.data.brand,
      card_last4: card.data.last4,
      card_exp_month: card.data.expMonth,
      card_exp_year: card.data.expYear,
    })
    .eq("rider_id", user.id);

  if (error) return failed("We couldn't save that card. Try again in a moment.");

  // Best-effort: the new card is already recorded and usable, so a failure to detach the old one
  // must not present as a failure to add the new one. It leaves an unused PaymentMethod at Stripe,
  // which is untidy rather than harmful.
  if (previous && previous !== card.data.paymentMethodId) {
    const detached = await detachPaymentMethod(previous);
    if (!detached.ok) {
      console.warn("payments: could not detach the replaced card", {
        riderId: user.id,
        reason: detached.message,
      });
    }
  }

  return { ok: true, data: null };
}

// ─────────────────────────────────────────────────────────────────────────────── holds and captures

export type ChargeOutcome =
  | { readonly kind: "authorized" }
  /** The bank wants the rider to confirm. Not a failure — the browser finishes it. */
  | { readonly kind: "requires_action"; readonly clientSecret: string }
  | { readonly kind: "captured"; readonly capturedCents: number }
  | { readonly kind: "voided" }
  /** Nothing was attempted, or it failed in a way that will clear on its own. */
  | { readonly kind: "deferred"; readonly message: string }
  | { readonly kind: "failed"; readonly message: string };

/**
 * Places the hold for a ride the rider is booking.
 *
 * Writes the ledger row FIRST, then authorizes against it. The row's id is half the Stripe
 * idempotency key, so it has to exist before the call it protects — and a row with no
 * authorization is a recoverable state, while an authorization with no row is money reserved that
 * nothing remembers.
 *
 * `holdCents` comes from `holdAmountCents()`. This function does not compute it and must not.
 */
export async function authorizeRideCharge(
  rideId: string,
  riderId: string,
  holdCents: number,
): Promise<ChargeOutcome> {
  const service = createServiceRoleClient() as unknown as UntypedClient;

  const { data: profileRow } = await service
    .from("rider_payment_profiles")
    .select(PROFILE_COLUMNS)
    .eq("rider_id", riderId)
    .maybeSingle();

  const profile = profileRow as RiderPaymentProfileRow | null;
  if (!profile?.default_payment_method_id) {
    return { kind: "deferred", message: "Add a card to book this ride." };
  }

  const { data: chargeRow, error: insertError } = await service
    .from("ride_charges")
    .insert({ ride_id: rideId, rider_id: riderId, authorized_cents: holdCents })
    .select(CHARGE_COLUMNS)
    .single();

  if (insertError || !chargeRow) {
    return { kind: "failed", message: "We couldn't set up payment for that ride." };
  }

  const charge = chargeRow as RideChargeRow;

  const { data: attempt, error: claimError } = await service.rpc("claim_ride_charge_attempt", {
    p_charge_id: charge.id,
  });

  if (claimError || attempt === null) {
    return { kind: "failed", message: "We couldn't start that payment. Try again in a moment." };
  }

  try {
    const result = await authorizePayment({
      customerId: profile.stripe_customer_id,
      paymentMethodId: profile.default_payment_method_id,
      amountCents: holdCents,
      rideId,
      chargeId: charge.id,
      attempt,
    });

    if (!result.ok) {
      await service
        .from("ride_charges")
        .update({ status: "failed", failure_reason: result.message })
        .eq("id", charge.id);
      return { kind: "failed", message: result.message };
    }

    if (result.status === "requires_action") {
      // Left `authorizing`: the hold is not in place until the rider answers their bank. The
      // webhook or the browser's follow-up moves it on from here.
      await service
        .from("ride_charges")
        .update({ stripe_payment_intent_id: result.paymentIntentId })
        .eq("id", charge.id);
      return { kind: "requires_action", clientSecret: result.clientSecret };
    }

    await service
      .from("ride_charges")
      .update({
        status: "authorized",
        stripe_payment_intent_id: result.paymentIntentId,
        failure_reason: null,
      })
      .eq("id", charge.id);

    return { kind: "authorized" };
  } finally {
    await service.rpc("release_ride_charge_attempt", { p_charge_id: charge.id });
  }
}

/**
 * Takes money from a hold that is already in place.
 *
 * Shared by the two things that capture: a completed ride (the fare) and a late cancellation (the
 * fee). They differ only in the amount and in what the ride's status will be — which is exactly
 * why `ride_charges` needs no `kind` column.
 *
 * Best-effort by design. A capture failure must never turn a completed ride into a failed one:
 * the ride happened, the driver is owed, and the charge stays `authorized` and retryable.
 */
async function captureCharge(rideId: string, amountCents: number): Promise<ChargeOutcome> {
  const service = createServiceRoleClient() as unknown as UntypedClient;

  const { data, error } = await service
    .from("ride_charges")
    .select(CHARGE_COLUMNS)
    .eq("ride_id", rideId)
    .eq("status", "authorized")
    .maybeSingle();

  if (error) return { kind: "failed", message: "We couldn't load that payment." };
  if (!data) return { kind: "deferred", message: "There's no hold to capture for this ride." };

  const charge = data as RideChargeRow;

  if (!charge.stripe_payment_intent_id) {
    return { kind: "deferred", message: "That hold isn't in place yet." };
  }

  // Never capture more than was held. The database CHECK and Stripe would both refuse it, but
  // refusing here means the ledger never records an attempt that could not have succeeded.
  const capturable = Math.min(amountCents, charge.authorized_cents);

  const { data: attempt, error: claimError } = await service.rpc("claim_ride_charge_attempt", {
    p_charge_id: charge.id,
  });

  if (claimError) return { kind: "failed", message: "We couldn't start that capture." };
  if (attempt === null) {
    return { kind: "deferred", message: "This payment is already being processed." };
  }

  try {
    const result = await capturePayment({
      paymentIntentId: charge.stripe_payment_intent_id,
      amountCents: capturable,
      chargeId: charge.id,
      attempt,
    });

    if (!result.ok) {
      // A retryable failure leaves the row `authorized` so it can be captured later; only a
      // terminal one marks it `failed`. Same pending-vs-failed discipline the payout ledger uses.
      const nextStatus = result.retryable ? "authorized" : "failed";
      await service
        .from("ride_charges")
        .update({ status: nextStatus, failure_reason: result.message })
        .eq("id", charge.id);

      return result.retryable
        ? { kind: "deferred", message: result.message }
        : { kind: "failed", message: result.message };
    }

    const { error: updateError } = await service
      .from("ride_charges")
      .update({
        status: "captured",
        captured_cents: result.capturedCents,
        failure_reason: null,
      })
      .eq("id", charge.id)
      .neq("status", "captured");

    if (updateError) {
      // The money moved but the ledger didn't — the one inconsistency here a retry cannot fix on
      // its own, since Stripe's idempotency key means the retry returns the same capture.
      console.error("payments: capture succeeded but the ledger update failed", {
        rideId,
        chargeId: charge.id,
        cause: updateError.message,
      });
      return {
        kind: "failed",
        message: "Your payment went through but our records didn't update.",
      };
    }

    return { kind: "captured", capturedCents: result.capturedCents };
  } finally {
    await service.rpc("release_ride_charge_attempt", { p_charge_id: charge.id });
  }
}

/**
 * Captures the fare for a completed ride.
 *
 * The amount is the ride's stored `rider_total_cents` — what the rider agreed to at booking, and
 * what the driver's commission was computed against. Nothing reprices at completion (see
 * `authorization.ts`), so this is both the quote and the final figure.
 */
export async function captureRideCharge(rideId: string): Promise<ChargeOutcome> {
  const service = createServiceRoleClient() as unknown as UntypedClient;

  const { data, error } = await service
    .from("rides")
    .select("rider_total_cents, fare_cents")
    .eq("id", rideId)
    .maybeSingle();

  if (error || !data) return { kind: "failed", message: "We couldn't find that ride." };

  // `rider_total_cents` is null only for rides booked before ADR-0017 shipped, which by definition
  // have no hold to capture either. Falling back to `fare_cents` keeps the read total rather than
  // throwing on a row that will never reach this path.
  const amount = (data.rider_total_cents ?? data.fare_cents) as number;

  return captureCharge(rideId, amount);
}

/**
 * Captures a cancellation fee from the hold the rider already placed.
 *
 * A partial capture of the SAME PaymentIntent — no new card interaction, no second authorization,
 * no chance of a decline at the awkward moment. The rest of the hold is released.
 *
 * **Must run BEFORE the ride's status flips to `canceled`**: `queue_cancellation_payout()` reads
 * the captured row to pay the driver, so capturing afterwards would silently pay nobody.
 */
export async function chargeCancellationFee(
  rideId: string,
  feeCents: number,
): Promise<ChargeOutcome> {
  return captureCharge(rideId, feeCents);
}

/**
 * Releases a hold in full, taking nothing. A free cancellation.
 *
 * Idempotent from the caller's side: a ride with no live hold is not an error, since a rider can
 * cancel a ride whose authorization never completed.
 */
export async function voidRideCharge(rideId: string): Promise<ChargeOutcome> {
  const service = createServiceRoleClient() as unknown as UntypedClient;

  const { data, error } = await service
    .from("ride_charges")
    .select(CHARGE_COLUMNS)
    .eq("ride_id", rideId)
    .in("status", ["authorizing", "authorized"])
    .maybeSingle();

  if (error) return { kind: "failed", message: "We couldn't load that payment." };
  if (!data) return { kind: "deferred", message: "There's no hold to release for this ride." };

  const charge = data as RideChargeRow;

  const { data: attempt, error: claimError } = await service.rpc("claim_ride_charge_attempt", {
    p_charge_id: charge.id,
  });

  if (claimError) return { kind: "failed", message: "We couldn't release that hold." };
  if (attempt === null) {
    return { kind: "deferred", message: "This payment is already being processed." };
  }

  try {
    // A charge that never got as far as a PaymentIntent has nothing at Stripe to cancel — record
    // it voided locally and move on.
    if (charge.stripe_payment_intent_id) {
      const result = await cancelPayment(charge.stripe_payment_intent_id);
      if (!result.ok) {
        await service
          .from("ride_charges")
          .update({ failure_reason: result.message })
          .eq("id", charge.id);
        return { kind: "deferred", message: result.message };
      }
    }

    await service
      .from("ride_charges")
      .update({ status: "voided", failure_reason: null })
      .eq("id", charge.id);

    return { kind: "voided" };
  } finally {
    await service.rpc("release_ride_charge_attempt", { p_charge_id: charge.id });
  }
}

// ──────────────────────────────────────────────────────────────────────────── webhook reconciliation

/**
 * Records what Stripe says happened to a PaymentIntent.
 *
 * Called only from the signature-verified webhook. Writes the intent's CURRENT STATE rather than
 * applying a delta, which is what keeps the webhook route idempotent without a processed-event
 * table — the same property `account.updated` has, and the route's header comment explains why it
 * matters.
 */
export async function syncChargeFromWebhook(
  paymentIntentId: string,
  status: "captured" | "failed" | "voided",
  capturedCents: number | null,
  failureReason: string | null,
): Promise<PaymentsResult<null>> {
  const service = createServiceRoleClient() as unknown as UntypedClient;

  const patch: Record<string, unknown> = { status, failure_reason: failureReason };
  if (status === "captured") patch.captured_cents = capturedCents;

  const { error } = await service
    .from("ride_charges")
    .update(patch)
    .eq("stripe_payment_intent_id", paymentIntentId)
    // Never walk a settled charge backwards. Stripe can deliver events out of order, and a late
    // `payment_failed` for an intent that was subsequently captured must not un-capture it.
    .neq("status", "captured");

  if (error) return failed("We couldn't record that payment update.");
  return { ok: true, data: null };
}
