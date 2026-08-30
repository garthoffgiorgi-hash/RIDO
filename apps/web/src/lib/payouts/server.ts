import "server-only";

import { requireUser } from "@/lib/auth/server";
import { getOwnDriverProfile } from "@/lib/drivers/server.ts";
import type { DriverProfile } from "@/lib/drivers/status.ts";
import {
  canReceiveTransfers,
  type ConnectStatus,
  connectStatus,
  connectStatusMessage,
} from "@/lib/stripe/account-status.ts";
import {
  accountStateFrom,
  createConnectAccount,
  createOnboardingLink,
  createTransfer,
  retrieveAccountState,
  type StripeAccount,
} from "@/lib/stripe/server.ts";
import { createServerClient, createServiceRoleClient } from "@/lib/supabase/server";
import { failed, type PayoutsResult } from "./result.ts";
import type { DriverConnectColumns, DriverPayoutRow } from "./types.ts";

/**
 * What RIDO owes a driver, and getting it to them.
 *
 * The split mirrors `maps/` (vendor) against `fares/` (domain): `lib/stripe/` knows Stripe,
 * this module knows what a payout *is*. Nothing here imports the Stripe SDK — `check-context.mjs`
 * rule 7 would fail the build if it did.
 *
 * **No money is computed anywhere in this file.** `amount_cents` is read off the ledger row, which
 * a database trigger copied from the ride's commission snapshot at completion. RIDO absorbs card
 * processing (ADR-0015), so what gets transferred is exactly that figure with nothing deducted.
 * If you find yourself adding arithmetic to a cents value here, something has gone wrong upstream.
 */

/**
 * `driver_payouts` and the two new `drivers` columns are not in the generated types yet — see
 * `./types.ts`. These casts are the whole of the bridge, kept at the query boundary so the rows
 * they produce are strongly typed everywhere downstream. Remove with `./types.ts`.
 */
// biome-ignore lint/suspicious/noExplicitAny: the generated types predate this migration; see ./types.ts
type UntypedClient = { from: (table: string) => any };

/** Every column of `DriverPayoutRow`, named once so the three reads below cannot drift apart. */
const PAYOUT_COLUMNS =
  "id, driver_id, ride_id, amount_cents, status, stripe_transfer_id, failure_reason, created_at, updated_at";

export interface PayoutSummary {
  readonly connectStatus: ConnectStatus;
  readonly connectMessage: string;
  /** Everything Stripe has confirmed sent. Sum of `paid` ledger rows. */
  readonly paidCents: number;
  /** Earned, recorded, not yet sent — for any reason. Sum of `pending` rows. */
  readonly pendingCents: number;
  /** Stripe refused for a reason that won't clear on its own. Sum of `failed` rows. */
  readonly failedCents: number;
  readonly unsettled: readonly DriverPayoutRow[];
}

/**
 * The driver's payout position, for `/drive`.
 *
 * The three totals are sums of stored snapshots, not a computation — each `amount_cents` was
 * copied from a ride's write-once commission snapshot, so totalling them is the same kind of
 * aggregation `driver_monthly_stats` already does by trigger. No rate, no percentage, no
 * arithmetic on a fare.
 *
 * Reads through the RLS-scoped client: `driver_payouts_select_own` scopes rows to their driver, so
 * there is nothing here needing the service role.
 */
export async function getPayoutSummary(
  driver: DriverProfile,
): Promise<PayoutsResult<PayoutSummary>> {
  const supabase = (await createServerClient()) as unknown as UntypedClient;

  const { data, error } = await supabase
    .from("driver_payouts")
    .select(PAYOUT_COLUMNS)
    .eq("driver_id", driver.id)
    .order("created_at", { ascending: false });

  if (error) {
    return failed("We couldn't load your earnings right now. Try again in a moment.");
  }

  const rows = (data ?? []) as DriverPayoutRow[];
  const totalFor = (status: DriverPayoutRow["status"]) =>
    rows.filter((row) => row.status === status).reduce((sum, row) => sum + row.amount_cents, 0);

  const connect = driver as DriverProfile & Partial<DriverConnectColumns>;
  const status = connectStatus(
    driver.stripe_account_id === null
      ? null
      : {
          payoutsEnabled: connect.stripe_payouts_enabled ?? false,
          detailsSubmitted: connect.stripe_details_submitted ?? false,
          // The locally mirrored columns carry no requirements detail — that lives on Stripe's
          // side. Absent them, an account that has submitted but isn't enabled reads as
          // pending_verification, which is the right default: it tells the driver to wait rather
          // than sending them back into a form they already completed.
          currentlyDue: [],
          disabledReason: null,
        },
  );

  return {
    ok: true,
    data: {
      connectStatus: status,
      connectMessage: connectStatusMessage(status),
      paidCents: totalFor("paid"),
      pendingCents: totalFor("pending"),
      failedCents: totalFor("failed"),
      unsettled: rows.filter((row) => row.status !== "paid"),
    },
  };
}

/**
 * Starts or resumes Stripe Connect onboarding, returning a URL to send the driver to.
 *
 * Creates the Express account on first call and stores its id through the service role —
 * `stripe_account_id` is deliberately absent from `drivers`' column-level `UPDATE` grant, so a
 * driver cannot assert their own account id, which is exactly right for a value only Stripe can
 * issue.
 *
 * The returned link is single-use and short-lived, so it is never cached or stored; every attempt
 * mints a fresh one.
 */
export async function startConnectOnboarding(
  origin: string,
): Promise<PayoutsResult<{ url: string }>> {
  const user = await requireUser();
  const driver = await getOwnDriverProfile(user);
  if (!driver) return failed("You don't have a driver profile yet.");

  let accountId = driver.stripe_account_id;

  if (!accountId) {
    const created = await createConnectAccount(user.email ?? driver.email);
    if (!created.ok) return failed(created.message);
    accountId = created.data;

    const service = createServiceRoleClient();
    const { error } = await service
      .from("drivers")
      .update({ stripe_account_id: accountId })
      .eq("id", driver.id);

    if (error) {
      // The Stripe account now exists but we failed to record it. Refuse rather than proceed:
      // returning a link here would onboard the driver into an account this system has no
      // record of, and the next attempt would create a second one.
      return failed("We couldn't save your payout account. Try again in a moment.");
    }
  }

  const link = await createOnboardingLink(
    accountId,
    // Stripe sends them here if the link expired before they finished — landing on /drive means
    // the card renders and its button mints a fresh link.
    `${origin}/drive`,
    `${origin}/drive?onboarding=return`,
  );
  if (!link.ok) return failed(link.message);

  return { ok: true, data: { url: link.data } };
}

/**
 * Re-reads Stripe's word on the driver's account and mirrors it locally.
 *
 * Called when the driver returns from onboarding, because the `account.updated` webhook and the
 * browser redirect race — whichever arrives first, `/drive` should show the truth rather than a
 * stale `false`.
 */
export async function refreshConnectState(driver: DriverProfile): Promise<PayoutsResult<null>> {
  if (!driver.stripe_account_id) return { ok: true, data: null };

  const state = await retrieveAccountState(driver.stripe_account_id);
  if (!state.ok) return failed(state.message);

  return syncConnectColumns(driver.stripe_account_id, {
    payoutsEnabled: state.data.payoutsEnabled,
    detailsSubmitted: state.data.detailsSubmitted,
  });
}

/**
 * Writes Stripe's account flags onto the `drivers` row, keyed by the Stripe account id.
 *
 * Shared by the onboarding-return path and the webhook, so the two can never interpret the same
 * account differently. Service role, because neither column is writable by `authenticated` — a
 * driver asserting their own `payouts_enabled` wouldn't make a transfer succeed, but it would let
 * the UI promise one.
 */
export async function syncConnectColumns(
  stripeAccountId: string,
  flags: { payoutsEnabled: boolean; detailsSubmitted: boolean },
): Promise<PayoutsResult<null>> {
  const service = createServiceRoleClient() as unknown as UntypedClient;

  const { error } = await service
    .from("drivers")
    .update({
      stripe_payouts_enabled: flags.payoutsEnabled,
      stripe_details_submitted: flags.detailsSubmitted,
    })
    .eq("stripe_account_id", stripeAccountId);

  if (error) return failed("We couldn't update your payout status.");
  return { ok: true, data: null };
}

/** Interprets a Stripe `Account` from a webhook payload and mirrors it. Shared mapping, one path. */
export async function syncConnectAccountFromWebhook(
  account: StripeAccount,
): Promise<PayoutsResult<null>> {
  const state = accountStateFrom(account);
  return syncConnectColumns(account.id, {
    payoutsEnabled: state.payoutsEnabled,
    detailsSubmitted: state.detailsSubmitted,
  });
}

export type SettleOutcome =
  | { readonly kind: "paid"; readonly transferId: string }
  /** Not sent, and expected to be sent later — onboarding incomplete, or a retryable failure. */
  | { readonly kind: "deferred"; readonly message: string }
  /** Stripe refused for a reason that will not clear by itself. Needs a person. */
  | { readonly kind: "failed"; readonly message: string };

/**
 * Attempts to send one ledger row's money, and records what happened.
 *
 * **Ledger semantics, which the status values encode deliberately:**
 *   `pending` — owed, not sent. Covers "not tried yet", "driver hasn't onboarded", and "Stripe
 *               failed in a way that will clear". All of these get retried; none is an error
 *               state a person needs to look at.
 *   `failed`  — tried, and refused terminally. Something needs a human.
 *   `paid`    — Stripe confirmed it, and the row carries the transfer id proving so
 *               (`driver_payouts_transfer_id_iff_paid` refuses `paid` without one).
 *
 * A driver who hasn't finished Connect onboarding leaves the row `pending` rather than `failed`:
 * nothing was attempted, nothing is wrong, and the money is still theirs. That distinction is what
 * keeps `/drive` from telling a driver their earnings "failed" when they simply haven't linked a
 * bank yet.
 */
async function settle(payout: DriverPayoutRow): Promise<PayoutsResult<SettleOutcome>> {
  const service = createServiceRoleClient() as unknown as UntypedClient;

  const { data: driverRow, error: driverError } = await service
    .from("drivers")
    .select("id, stripe_account_id, stripe_payouts_enabled, stripe_details_submitted")
    .eq("id", payout.driver_id)
    .maybeSingle();

  if (driverError || !driverRow) return failed("We couldn't find that driver.");

  const driver = driverRow as {
    stripe_account_id: string | null;
    stripe_payouts_enabled: boolean;
    stripe_details_submitted: boolean;
  };

  const status = connectStatus(
    driver.stripe_account_id === null
      ? null
      : {
          payoutsEnabled: driver.stripe_payouts_enabled,
          detailsSubmitted: driver.stripe_details_submitted,
          currentlyDue: [],
          disabledReason: null,
        },
  );

  if (!driver.stripe_account_id || !canReceiveTransfers(status)) {
    // Left pending on purpose — see the docstring. Nothing was attempted.
    return { ok: true, data: { kind: "deferred", message: connectStatusMessage(status) } };
  }

  const transfer = await createTransfer({
    accountId: driver.stripe_account_id,
    amountCents: payout.amount_cents,
    payoutId: payout.id,
    rideId: payout.ride_id,
  });

  if (!transfer.ok) {
    // `retryable` comes from the original Stripe error, classified inside the vendor boundary —
    // it is what decides pending-vs-failed, and it must not be re-derived from the translated
    // message, which no longer carries the error's type or code.
    const nextStatus = transfer.retryable ? "pending" : "failed";

    await service
      .from("driver_payouts")
      .update({ status: nextStatus, failure_reason: transfer.message })
      .eq("id", payout.id);

    return {
      ok: true,
      data: transfer.retryable
        ? { kind: "deferred", message: transfer.message }
        : { kind: "failed", message: transfer.message },
    };
  }

  // Conditional on still being unpaid, matching the discipline accept and start-trip use. Stripe's
  // idempotency key already makes a duplicate transfer impossible, so this guards the record
  // rather than the money — but a ledger that can be overwritten is a ledger you can't trust.
  const { error: updateError } = await service
    .from("driver_payouts")
    .update({
      status: "paid",
      stripe_transfer_id: transfer.transferId,
      failure_reason: null,
    })
    .eq("id", payout.id)
    .neq("status", "paid");

  if (updateError) {
    // The money moved but the ledger didn't. Loud, because it is the one inconsistency here that
    // a retry cannot fix on its own — Stripe's idempotency key means the retry returns the same
    // transfer, so the row can still be reconciled, but someone should know.
    console.error("payouts: transfer succeeded but ledger update failed", {
      payoutId: payout.id,
      transferId: transfer.transferId,
      cause: updateError.message,
    });
    return failed("Your payout was sent but we couldn't update our records. We're on it.");
  }

  return { ok: true, data: { kind: "paid", transferId: transfer.transferId } };
}

/**
 * Sends the payout for a completed ride, if there is one to send.
 *
 * Called best-effort right after a ride completes. A missing row is not an error: a zero-payout
 * ride legitimately produces none (`queue_driver_payout` skips it), and neither is a ride whose
 * payout was already settled.
 */
export async function payoutRide(rideId: string): Promise<PayoutsResult<SettleOutcome | null>> {
  await requireUser();
  const service = createServiceRoleClient() as unknown as UntypedClient;

  const { data, error } = await service
    .from("driver_payouts")
    .select(PAYOUT_COLUMNS)
    .eq("ride_id", rideId)
    .maybeSingle();

  if (error) return failed("We couldn't load that payout.");
  if (!data) return { ok: true, data: null };

  const payout = data as DriverPayoutRow;
  if (payout.status === "paid") return { ok: true, data: null };

  return settle(payout);
}

/** Retries one unsettled payout — the affordance behind `/drive`'s pending/failed list. */
export async function retryPayout(payoutId: string): Promise<PayoutsResult<SettleOutcome>> {
  const user = await requireUser();
  const driver = await getOwnDriverProfile(user);
  if (!driver) return failed("You don't have a driver profile yet.");

  const service = createServiceRoleClient() as unknown as UntypedClient;
  const { data, error } = await service
    .from("driver_payouts")
    .select(PAYOUT_COLUMNS)
    .eq("id", payoutId)
    .maybeSingle();

  if (error || !data) return failed("We couldn't find that payout.");

  const payout = data as DriverPayoutRow;
  // Ownership is checked here rather than left to RLS: this read goes through the service role,
  // which bypasses it, so the check is the real gate — the same reasoning ADR-0014 applies to
  // completion.
  if (payout.driver_id !== driver.id) return failed("We couldn't find that payout.");
  if (payout.status === "paid") return failed("That payout has already been sent.");

  return settle(payout);
}
