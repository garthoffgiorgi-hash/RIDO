"use server";

import { headers } from "next/headers";
import * as drivers from "@/lib/drivers/server";
import * as payments from "@/lib/payments/server";
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

export async function declineRide(rideId: string) {
  return rides.declineRide(rideId);
}

/** Online/offline. The write goes through RLS rather than the service role — see ADR-0019. */
export async function setAcceptingRides(accepting: boolean) {
  return drivers.setAcceptingRides(accepting);
}

export async function startTrip(rideId: string) {
  return rides.startTrip(rideId);
}

/**
 * Completes the ride, takes the rider's money, then pays the driver — in that order, with neither
 * money step able to affect the outcome the caller sees.
 *
 * **Capture before payout, deliberately (ADR-0017).** The capture is what puts real funds in
 * RIDO's platform balance, and the transfer draws on that balance. Running them the other way
 * round is precisely the `balance_insufficient` that ADR-0015 documented as the expected
 * production failure and that rider charging exists to end — the payout would ask for money that
 * the capture had not yet brought in.
 *
 * **Neither failure may turn a completed ride into a failed one.** The ride is finished either
 * way, the commission snapshot is written either way, and the driver is owed either way —
 * `queue_driver_payout` recorded that inside the completion transaction before this code ran. So
 * both are best-effort and the two ledgers are what remember: an uncaptured charge stays
 * `authorized` and retryable, an unsent payout stays `pending`.
 */
export async function completeRide(rideId: string) {
  const outcome = await rides.completeRide(rideId);
  if (outcome.kind !== "completed") return outcome;

  try {
    await payments.captureRideCharge(rideId);
  } catch (cause) {
    console.error("payments: captureRideCharge threw after a successful completion", {
      rideId,
      cause,
    });
  }

  try {
    await payouts.payoutRide(rideId);
  } catch (cause) {
    // Swallowed deliberately — see above. Logged because a money path that throws (rather than
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
