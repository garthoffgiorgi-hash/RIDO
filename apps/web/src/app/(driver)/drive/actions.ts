"use server";

import { headers } from "next/headers";
import * as payouts from "@/lib/payouts/server";
import * as rides from "@/lib/rides/server";

/**
 * Thin Server Action bridge over `src/lib/rides/server.ts` and `src/lib/payouts/server.ts`,
 * matching `(rider)/request/actions.ts`'s pattern — both carry `import "server-only"` and neither
 * is itself `"use server"`, so a Client Component can't call them directly. `listOpenRequests`,
 * `getDriverActiveRide` and `getPayoutSummary` don't need a wrapper here: `drive/page.tsx` is a
 * Server Component and reads them directly.
 */
export async function acceptRide(rideId: string) {
  return rides.acceptRide(rideId);
}

export async function startTrip(rideId: string) {
  return rides.startTrip(rideId);
}

/**
 * Completes the ride, then tries to pay the driver — in that order, and with the payout attempt
 * unable to affect the outcome the caller sees.
 *
 * **A payout failure must never turn a completed ride into a failed one.** The ride is finished
 * either way, the commission snapshot is written either way, and the money is owed either way —
 * `queue_driver_payout` recorded that inside the completion transaction before this code ran. So
 * the transfer is best-effort here and the ledger is what remembers; a driver whose Stripe
 * onboarding isn't finished simply accrues `pending` rows until it is.
 */
export async function completeRide(rideId: string) {
  const outcome = await rides.completeRide(rideId);
  if (outcome.kind !== "completed") return outcome;

  try {
    await payouts.payoutRide(rideId);
  } catch (cause) {
    // Swallowed deliberately — see above. Logged because a payout path that throws (rather than
    // returning a failure) is a bug worth seeing, even though it must not surface here.
    console.error("payouts: payoutRide threw after a successful completion", { rideId, cause });
  }

  return outcome;
}

/**
 * Mints a fresh Stripe onboarding link. The origin comes from the request headers rather than an
 * env var so the return URL is correct on localhost, a preview deployment and production alike
 * without three separate configurations.
 */
export async function startConnectOnboarding() {
  const headerList = await headers();
  const host = headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "https";
  if (!host) {
    return { ok: false as const, message: "We couldn't work out where to send you back to." };
  }
  return payouts.startConnectOnboarding(`${protocol}://${host}`);
}

export async function retryPayout(payoutId: string) {
  return payouts.retryPayout(payoutId);
}
