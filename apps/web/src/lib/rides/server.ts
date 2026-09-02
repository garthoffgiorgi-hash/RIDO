import "server-only";

import {
  type Bps,
  type Cents,
  cents,
  commissionForRide,
  type FareBreakdown,
  holdAmountCents,
} from "@rido/pricing";
import type { User } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/server";
import { getActiveCommissionTiers, getDriverMonthToDateCents } from "@/lib/commission/server.ts";
import { getOwnDriverProfile } from "@/lib/drivers/server.ts";
import type { DriverProfile } from "@/lib/drivers/status.ts";
import { getPaymentPolicy, quoteRide } from "@/lib/fares/server";
import { measureRoute } from "@/lib/maps/server.ts";
import type { Coordinates, Place, RouteGeometry } from "@/lib/maps/types.ts";
import {
  authorizeRideCharge,
  chargeCancellationFee,
  getPaymentProfile,
  voidRideCharge,
} from "@/lib/payments/server.ts";
import { payoutRide } from "@/lib/payouts/server.ts";
import { createServerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import { canAcceptRide, type OpenRide } from "./accept.ts";
import { cancellationOutcome } from "./cancellation.ts";
import { completionErrorMessage } from "./completion-errors.ts";
import { failed, type RidesResult } from "./result.ts";
import { canStartTrip, type StartableRide } from "./start.ts";
import { ACTIVE_STATUSES, type RideStatus } from "./status.ts";

/**
 * The booking half (rider), the accept half (driver), and the completion half that closes the
 * loop: quote a trip, book it, read the one ride that's live, cancel it, list what's open, accept
 * one, start it, complete it. `complete-ride`'s SDK boundary is the model for booking and accept
 * — a service-role write reached through exactly the functions here, never a client insert.
 * Completion is different in kind: `complete-ride` is not a table this module writes to directly,
 * it is a deployed Edge Function this module *calls*, forwarding the signed-in driver's own
 * session rather than re-implementing what it already enforces. See ADR-0012, ADR-0013, ADR-0014.
 */

const messageOf = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/**
 * `ride_declines` (ADR-0019) postdates the generated types, so its two touch points here reach it
 * through this narrow escape hatch rather than a whole bridge file. **Temporary** — it goes away
 * when `npm run types:generate` runs against the pushed migration, same as the note on
 * `DriverProfile` in `src/lib/drivers/status.ts`. Every row it produces is cast to a real shape at
 * the query boundary, so nothing downstream is `any`.
 */
type UntypedTables = {
  // biome-ignore lint/suspicious/noExplicitAny: the generated types predate ride_declines
  from: (table: string) => any;
};

/** First market is San Diego, matching every other hardcoded market string in this codebase. */
const MARKET = "san-diego";

export interface RideQuote {
  readonly fareCents: number;
  readonly riderTotalCents: number;
  readonly breakdown: FareBreakdown;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly geometry: RouteGeometry | null;
}

/** Composes the two server-only reads a quote needs. Not exported — both public functions below share it. */
async function measureAndQuote(
  pickup: Coordinates,
  dropoff: Coordinates,
): Promise<RidesResult<RideQuote>> {
  const measurement = await measureRoute(pickup, dropoff);
  if (!measurement.ok) return measurement;

  const quote = await quoteRide(measurement.data, MARKET);
  if (!quote.ok) return quote;

  return {
    ok: true,
    data: {
      fareCents: quote.data.fareCents,
      riderTotalCents: quote.data.riderTotalCents,
      breakdown: quote.data.breakdown,
      distanceMeters: measurement.data.distanceMeters,
      durationSeconds: measurement.data.durationSeconds,
      geometry: measurement.data.geometry,
    },
  };
}

/**
 * The fare shown before a rider commits to anything. Read-only — measures and prices, writes
 * nothing. Called every time the pickup or dropoff changes, same as `/dev/maps`'s quote panel.
 */
export async function quoteRideRequest(
  pickup: Coordinates,
  dropoff: Coordinates,
): Promise<RidesResult<RideQuote>> {
  await requireUser();
  return measureAndQuote(pickup, dropoff);
}

export type RequestRideOutcome =
  | { readonly kind: "booked"; readonly rideId: string }
  | { readonly kind: "price_changed"; readonly quote: RideQuote }
  /** No card on file. The sheet collects one and calls back — never a dead end mid-booking. */
  | { readonly kind: "needs_card" }
  /** The rider's bank wants them to confirm. The browser finishes it and calls back. */
  | { readonly kind: "needs_confirmation"; readonly rideId: string; readonly clientSecret: string }
  | { readonly kind: "failed"; readonly message: string };

/**
 * Books a ride, or explains why it didn't book.
 *
 * Re-measures and re-prices from scratch rather than trusting anything the browser is holding —
 * `shownFareCents` is compared against, never stored. The number that actually reaches the row is
 * always the fresh quote computed right here, from our own rate card (ADR-0009, ADR-0010). A
 * tampered `shownFareCents` can only ever trigger a spurious re-confirm or suppress a real one —
 * it cannot move a price by one cent.
 *
 * If the fresh fare disagrees with what the rider was shown, nothing is written: the caller gets
 * the new quote back and re-confirms, one extra tap rather than a rider being charged a number
 * they never saw (ADR-0012).
 *
 * **Since ADR-0017 this also places a hold**, and the order is deliberate: the ride row is written
 * FIRST, then authorized against. The row's id is what the charge's foreign key, the PaymentIntent's
 * `transfer_group` and its metadata all need, so it has to exist before the call that references
 * it. And if the authorization then fails, the ride is canceled right back — leaving it
 * `'requested'` would trip `rides_one_active_per_rider` and block the rider from booking anything
 * at all, stuck behind a ride they never actually got.
 */
export async function requestRide(
  pickup: Place,
  dropoff: Place,
  shownFareCents: number,
): Promise<RequestRideOutcome> {
  const user = await requireUser();

  if (!pickup.coordinates || !dropoff.coordinates) {
    return { kind: "failed", message: "Pick a specific pickup and dropoff to continue." };
  }

  const quote = await measureAndQuote(pickup.coordinates, dropoff.coordinates);
  if (!quote.ok) return { kind: "failed", message: quote.message };

  if (quote.data.fareCents !== shownFareCents) {
    return { kind: "price_changed", quote: quote.data };
  }

  // A card has to exist before a ride does. Checking here rather than after the insert means a
  // cardless rider never creates a row that has to be cleaned up — they get the card step instead.
  const profile = await getPaymentProfile(user);
  if (!profile.hasCard) {
    return { kind: "needs_card" };
  }

  const policy = await getPaymentPolicy(MARKET);
  if (!policy.ok) return { kind: "failed", message: policy.message };

  const payload: Database["public"]["Tables"]["rides"]["Insert"] = {
    rider_id: user.id,
    driver_id: null,
    fare_cents: quote.data.fareCents,
    // The end of a journey to nowhere: `riderTotalCents` has been computed by `quoteFare()` and
    // carried through `RideQuote` since ADR-0009, and discarded at this exact line until ADR-0017.
    // It is what the rider is charged; `fare_cents` is what commission splits. Equal today.
    rider_total_cents: quote.data.riderTotalCents,
    pickup_address: pickup.address,
    dropoff_address: dropoff.address,
  } as Database["public"]["Tables"]["rides"]["Insert"];

  const service = createServiceRoleClient();
  const { data, error } = await service.from("rides").insert(payload).select("id").single();

  if (error) {
    // 23505 is rides_one_active_per_rider — the expected, named conflict. Anything else is not.
    if (error.code === "23505") {
      return { kind: "failed", message: "You already have a ride in progress." };
    }
    return { kind: "failed", message: "We couldn't book that ride. Try again in a moment." };
  }

  const rideId = data.id;

  // The hold. `holdAmountCents` is @rido/pricing's — this function computes no money (root
  // CLAUDE.md invariant 5), it only says which numbers go in.
  const holdCents = holdAmountCents({
    riderTotalCents: quote.data.riderTotalCents as Cents,
    bufferBps: policy.data.authorizationBufferBps as Bps,
  });

  const charge = await authorizeRideCharge(rideId, user.id, holdCents);

  if (charge.kind === "requires_action") {
    // The ride exists and the hold is half-placed; the rider answers their bank and the browser
    // calls back. Deliberately NOT canceled here — cancelling a ride the rider is actively
    // authorizing would be undoing something that is still going right.
    return { kind: "needs_confirmation", rideId, clientSecret: charge.clientSecret };
  }

  if (charge.kind !== "authorized") {
    // Unwind. A `'requested'` ride with no hold would occupy the rider's one active-ride slot
    // (`rides_one_active_per_rider`) and lock them out of booking again — so the row that was
    // written a moment ago is canceled rather than left as a trap.
    await service
      .from("rides")
      .update({ status: "canceled", canceled_at: new Date().toISOString() })
      .eq("id", rideId);

    const message =
      charge.kind === "failed" || charge.kind === "deferred"
        ? charge.message
        : "We couldn't set up payment for that ride.";
    return { kind: "failed", message };
  }

  return { kind: "booked", rideId };
}

export interface ActiveRide {
  readonly id: string;
  readonly status: RideStatus;
  readonly fareCents: number;
  readonly pickupAddress: string | null;
  readonly dropoffAddress: string | null;
  readonly requestedAt: string;
}

/**
 * The signed-in rider's one live ride, or `null`. Takes the already-resolved `User`, the same
 * pattern `getOwnDriverProfile()` uses — every call site already has one from `requireUser()`.
 *
 * Reads through the RLS-scoped client: `rides_select_own_as_rider` already permits a rider to
 * read their own rows, so there's nothing here that needs the service role to bypass.
 */
export async function getActiveRide(user: User): Promise<ActiveRide | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("rides")
    .select("id, status, fare_cents, pickup_address, dropoff_address, requested_at")
    .eq("rider_id", user.id)
    .in("status", ACTIVE_STATUSES)
    .maybeSingle();

  if (error) {
    throw new Error(`getActiveRide: could not load the active ride — ${error.message}`);
  }
  if (!data) return null;

  return {
    id: data.id,
    status: data.status as RideStatus,
    fareCents: data.fare_cents,
    pickupAddress: data.pickup_address,
    dropoffAddress: data.dropoff_address,
    requestedAt: data.requested_at,
  };
}

/** What a cancellation cost the rider, so the caller can say so honestly. */
export interface CancellationResult {
  readonly feeChargedCents: number;
}

/**
 * Cancels a ride the signed-in user requested, releasing or partly capturing their hold.
 *
 * Re-checks ownership and the cancellation rule server-side rather than trusting that the button
 * was only rendered when it was allowed — the same defense-in-depth `requireUser()` already applies
 * to every Server Action here. The rule itself is `cancellationOutcome()`, pure and tested, which
 * replaced `canRiderCancel()` as the authority when ADR-0018 made late cancellation possible.
 *
 * **The order of the last two steps is load-bearing.** A fee is captured BEFORE the status flips
 * to `'canceled'`, because `queue_cancellation_payout()` fires on that transition and reads the
 * captured charge to pay the driver. Capturing afterwards would pay nobody, silently.
 */
export async function cancelRide(rideId: string): Promise<RidesResult<CancellationResult>> {
  const user = await requireUser();

  const supabase = await createServerClient();
  const { data: ride, error: readError } = await supabase
    .from("rides")
    .select("id, status, rider_id, accepted_at")
    .eq("id", rideId)
    .maybeSingle();

  if (readError || !ride || ride.rider_id !== user.id) {
    return failed("We couldn't find that ride.");
  }

  const policy = await getPaymentPolicy(MARKET);
  if (!policy.ok) return failed(policy.message);

  const outcome = cancellationOutcome({
    status: ride.status as RideStatus,
    acceptedAt: ride.accepted_at,
    now: new Date(),
    graceSeconds: policy.data.cancellationGraceSeconds,
    feeCents: policy.data.cancellationFeeCents,
  });

  if (outcome.kind === "forbidden") {
    return failed("That ride can no longer be canceled.");
  }

  let feeChargedCents = 0;

  if (outcome.kind === "fee") {
    const charged = await chargeCancellationFee(rideId, outcome.feeCents);
    if (charged.kind === "captured") {
      feeChargedCents = charged.capturedCents;
    } else if (charged.kind === "failed") {
      // Refuse rather than cancel for free. A capture that terminally failed means the rider's
      // card would not pay a fee they were told about — and quietly waiving it would make the
      // confirmation they just agreed to a lie in the other direction.
      return failed(charged.message);
    }
    // A `deferred` capture (no hold in place, or a retryable Stripe failure) cancels the ride
    // anyway with nothing captured. The alternative is trapping a rider in a ride they want out
    // of because our payment processor is having a moment.
  } else {
    // Free: release the whole hold. Best-effort — a rider must never be blocked from cancelling
    // because a void failed, and Stripe releases an uncaptured authorization on its own regardless.
    await voidRideCharge(rideId);
  }

  const patch: Database["public"]["Tables"]["rides"]["Update"] = {
    status: "canceled",
    canceled_at: new Date().toISOString(),
  };

  const service = createServiceRoleClient();
  const { error: updateError } = await service.from("rides").update(patch).eq("id", rideId);

  if (updateError) {
    return failed("We couldn't cancel that ride. Try again in a moment.");
  }

  // `queue_cancellation_payout()` fires inside the UPDATE above and has already inserted the
  // `driver_payouts` row by the time this runs — but inserting it is all that trigger does. Unlike
  // a completed ride, nothing else in this app ever revisits a cancellation-fee payout on its own:
  // `settlePendingPayoutsForDriver()` only runs on the driver's Connect-onboarding-return leg, and
  // `/drive` offers no retry affordance for a `pending` row (only `failed` ones get one). Without
  // this call, a late-cancellation fee would sit `pending` forever with nothing left to send it —
  // the same best-effort chain `completeRide()` runs for a fare, at the equivalent point.
  if (feeChargedCents > 0) {
    try {
      await payoutRide(rideId);
    } catch (cause) {
      console.error("payouts: payoutRide threw after a cancellation fee capture", {
        rideId,
        cause,
      });
    }
  }

  return { ok: true, data: { feeChargedCents } };
}

/**
 * What cancelling right now would cost, so `/request` can say so before the rider commits.
 *
 * Reads rather than writes — the same rule `cancelRide()` enforces, asked in advance. A rider
 * should never discover a fee by being charged one.
 */
export async function quoteCancellation(rideId: string): Promise<RidesResult<number>> {
  const user = await requireUser();

  const supabase = await createServerClient();
  const { data: ride, error } = await supabase
    .from("rides")
    .select("id, status, rider_id, accepted_at")
    .eq("id", rideId)
    .maybeSingle();

  if (error || !ride || ride.rider_id !== user.id) return failed("We couldn't find that ride.");

  const policy = await getPaymentPolicy(MARKET);
  if (!policy.ok) return failed(policy.message);

  const outcome = cancellationOutcome({
    status: ride.status as RideStatus,
    acceptedAt: ride.accepted_at,
    now: new Date(),
    graceSeconds: policy.data.cancellationGraceSeconds,
    feeCents: policy.data.cancellationFeeCents,
  });

  return { ok: true, data: outcome.kind === "fee" ? outcome.feeCents : 0 };
}

export interface OpenRideRequest {
  readonly id: string;
  readonly pickupAddress: string | null;
  readonly dropoffAddress: string | null;
  readonly fareCents: number;
  readonly driverPayoutCents: number;
  readonly commissionRateBps: number;
  readonly requestedAt: string;
}

/**
 * The open pool an active driver can accept from, each priced with what THIS driver would keep —
 * the "you keep $X (Y%)" figure `apps/web/CLAUDE.md` calls the product's core promise made
 * visible. A requested ride has no commission snapshot yet (that's written at completion,
 * ADR-0008), so this computes it live: the same `commissionForRide` `complete-ride` uses, fed the
 * same two database-sourced inputs (active tiers, this driver's MTD gross) rather than any
 * arithmetic here.
 *
 * All candidates are priced against the SAME month-to-date figure, read once — they're
 * alternatives the driver is choosing between, not a sequence where accepting one would change
 * what the next is worth.
 *
 * Reads through the RLS-scoped client: `rides_select_open_requests_as_active_driver` is what
 * makes this return anything for an active driver, and nothing for a pending or suspended one.
 */
export async function listOpenRequests(
  driver: DriverProfile,
): Promise<RidesResult<OpenRideRequest[]>> {
  const supabase = await createServerClient();
  const { data: openRides, error } = await supabase
    .from("rides")
    .select("id, fare_cents, pickup_address, dropoff_address, requested_at")
    .eq("status", "requested")
    .is("driver_id", null)
    .order("requested_at", { ascending: true });

  if (error) {
    return failed("We couldn't load open ride requests right now. Try again in a moment.");
  }
  if (!openRides || openRides.length === 0) {
    return { ok: true, data: [] };
  }

  // Drop what this driver has already waved off (ADR-0019). Scoped to the candidate ids rather
  // than reading their whole decline history: that history only ever grows — nothing reaps it —
  // while the board is bounded by however many rides are open right now. `ride_declines`' PK is
  // `(driver_id, ride_id)`, driver first, so this exact predicate is served by the index, and RLS
  // scopes it to the caller regardless.
  //
  // Filtered in JS rather than through PostgREST's `.not("id", "in", …)`, which needs a
  // hand-built parenthesised list and renders an empty one as `in ()` — a syntax error. A pool
  // large enough for that to matter wants a SQL anti-join instead, not a longer string.
  const { data: declined } = (await (supabase as unknown as UntypedTables)
    .from("ride_declines")
    .select("ride_id")
    .in(
      "ride_id",
      openRides.map((ride) => ride.id),
    )) as { data: { ride_id: string }[] | null };

  const declinedIds = new Set<string>((declined ?? []).map((row) => row.ride_id));
  const candidates = openRides.filter((ride) => !declinedIds.has(ride.id));

  if (candidates.length === 0) {
    return { ok: true, data: [] };
  }

  const tiers = await getActiveCommissionTiers();
  if (!tiers.ok) return tiers;

  const mtdGrossCents = await getDriverMonthToDateCents(driver.id);
  if (!mtdGrossCents.ok) return mtdGrossCents;

  return {
    ok: true,
    data: candidates.map((ride) => {
      const { driverPayoutCents, commissionRateBps } = commissionForRide({
        fareCents: cents(ride.fare_cents),
        mtdGrossCents: cents(mtdGrossCents.data),
        tiers: tiers.data,
      });

      return {
        id: ride.id,
        pickupAddress: ride.pickup_address,
        dropoffAddress: ride.dropoff_address,
        fareCents: ride.fare_cents,
        driverPayoutCents,
        commissionRateBps,
        requestedAt: ride.requested_at,
      };
    }),
  };
}

/**
 * Accepts a requested ride for the signed-in driver, or explains why it didn't take.
 *
 * `canAcceptRide()` runs first as a pre-flight check against the ride's current state, read
 * through the service role rather than RLS — an already-taken ride is invisible to this driver
 * under `rides_select_open_requests_as_active_driver`, so an RLS read can't tell "taken" apart
 * from "does not exist" the way a useful refusal message needs to. But that read-then-decide is
 * advisory, not the mechanism: two drivers can both pass it in the same instant. What actually
 * decides the race is the conditional UPDATE below, whose `WHERE` clause repeats
 * `status = 'requested' AND driver_id IS NULL` as a database-enforced predicate — atomic, no
 * lock, no retry loop needed the way `complete-ride`'s two-row write does (ADR-0013). Zero rows
 * updated means the pre-flight read was already stale: someone else won in between.
 *
 * **Availability is read here, not carried from the render.** `getOwnDriverProfile()` runs on every
 * call, so a driver who went offline in another tab after the board was drawn is refused by the
 * fresh row rather than an old one — which is why a stale tab needs no special handling (ADR-0019).
 */
export async function acceptRide(rideId: string): Promise<RidesResult<null>> {
  const user = await requireUser();
  const driver = await getOwnDriverProfile(user);

  if (!driver) {
    return failed("You don't have a driver profile yet.");
  }

  const service = createServiceRoleClient();

  const { data: ride, error: readError } = await service
    .from("rides")
    .select("status, driver_id")
    .eq("id", rideId)
    .maybeSingle();

  if (readError || !ride) {
    return failed("We couldn't find that ride.");
  }

  const openRide: OpenRide = { status: ride.status, driverId: ride.driver_id };
  const decision = canAcceptRide(openRide, {
    status: driver.status,
    acceptingRides: driver.accepting_rides,
  });
  if (!decision.allowed) {
    return failed(decision.message);
  }

  const { data: accepted, error: updateError } = await service
    .from("rides")
    .update({ driver_id: driver.id, status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", rideId)
    .eq("status", "requested")
    .is("driver_id", null)
    .select("id");

  if (updateError) {
    // 23505 is rides_one_active_per_driver — this driver already holds a live ride.
    if (updateError.code === "23505") {
      return failed("You already have a ride in progress.");
    }
    return failed("We couldn't accept that ride. Try again in a moment.");
  }

  if (!accepted || accepted.length === 0) {
    return failed("Another driver already accepted this ride.");
  }

  return { ok: true, data: null };
}

/**
 * Hides an open request from this driver's board, permanently (ADR-0019).
 *
 * **Nothing about the ride changes.** It stays `'requested'` with a null `driver_id`, stays in the
 * pool, and stays available to every other driver — a decline is one driver's opinion, never a
 * withdrawal of the rider's request. `listOpenRequests()` is the only reader.
 *
 * Deliberately unguarded against ride state. Declining a ride another driver accepted a moment ago
 * is inert: the row only ever filters a pool that ride has already left. A defensive status check
 * would add a failure mode where there is currently none, and a race for it to lose.
 *
 * Idempotent by primary key — `(driver_id, ride_id)` plus `on conflict do nothing`, the same idiom
 * `queue_driver_payout` uses, so a double-tapped Decline is a no-op rather than an error.
 */
export async function declineRide(rideId: string): Promise<RidesResult<null>> {
  const user = await requireUser();
  const driver = await getOwnDriverProfile(user);

  if (!driver) {
    return failed("You don't have a driver profile yet.");
  }

  const service = createServiceRoleClient() as unknown as UntypedTables;

  const { error } = await service
    .from("ride_declines")
    .upsert(
      { driver_id: driver.id, ride_id: rideId },
      { onConflict: "driver_id,ride_id", ignoreDuplicates: true },
    );

  if (error) {
    return failed("We couldn't hide that request. Try again in a moment.");
  }

  return { ok: true, data: null };
}

export interface DriverActiveRide {
  readonly id: string;
  readonly status: "accepted" | "in_progress";
  readonly pickupAddress: string | null;
  readonly dropoffAddress: string | null;
  readonly fareCents: number;
  readonly driverPayoutCents: number;
  readonly commissionRateBps: number;
  readonly startedAt: string | null;
}

/**
 * The signed-in driver's own live ride, or `null` — the read `/drive` needed and never had.
 * Without this, accepting a ride only ever existed in the accepting browser tab's local state;
 * `rides_one_active_per_driver` guarantees at most one row, so `maybeSingle()` is exact, not
 * optimistic.
 *
 * Priced the same way `listOpenRequests` prices the open pool: no snapshot exists until
 * `'completed'` (`rides_commission_present_iff_completed`), so "you keep $X" is computed live via
 * `commissionForRide` against this driver's current month-to-date position, never arithmetic here.
 */
export async function getDriverActiveRide(
  driver: DriverProfile,
): Promise<RidesResult<DriverActiveRide | null>> {
  const supabase = await createServerClient();
  const { data: ride, error } = await supabase
    .from("rides")
    .select("id, status, fare_cents, pickup_address, dropoff_address, started_at")
    .eq("driver_id", driver.id)
    .in("status", ["accepted", "in_progress"])
    .maybeSingle();

  if (error) {
    return failed("We couldn't load your current ride. Try again in a moment.");
  }
  if (!ride) {
    return { ok: true, data: null };
  }

  const tiers = await getActiveCommissionTiers();
  if (!tiers.ok) return tiers;

  const mtdGrossCents = await getDriverMonthToDateCents(driver.id);
  if (!mtdGrossCents.ok) return mtdGrossCents;

  const { driverPayoutCents, commissionRateBps } = commissionForRide({
    fareCents: cents(ride.fare_cents),
    mtdGrossCents: cents(mtdGrossCents.data),
    tiers: tiers.data,
  });

  return {
    ok: true,
    data: {
      id: ride.id,
      status: ride.status as "accepted" | "in_progress",
      pickupAddress: ride.pickup_address,
      dropoffAddress: ride.dropoff_address,
      fareCents: ride.fare_cents,
      driverPayoutCents,
      commissionRateBps,
      startedAt: ride.started_at,
    },
  };
}

/**
 * Moves an accepted ride to `'in_progress'` for the signed-in driver.
 *
 * Same shape as `acceptRide`: `canStartTrip()` runs first as a fast, friendly pre-flight check
 * (read through the service role — an already-moved-on ride may not be this driver's own row
 * under RLS, and the refusal needs to say why), then the conditional `UPDATE` repeats the whole
 * predicate — `status = 'accepted' AND driver_id = ?` — as the actual mechanism. There is no
 * multi-driver race here the way accept has (only this ride's own driver can ever match the
 * predicate), but a double-tap of the same button is a real case: the second call's `UPDATE`
 * matches zero rows once the first has already moved the row to `'in_progress'`.
 */
export async function startTrip(rideId: string): Promise<RidesResult<null>> {
  const user = await requireUser();
  const driver = await getOwnDriverProfile(user);

  if (!driver) {
    return failed("You don't have a driver profile yet.");
  }

  const service = createServiceRoleClient();

  const { data: ride, error: readError } = await service
    .from("rides")
    .select("status, driver_id")
    .eq("id", rideId)
    .maybeSingle();

  if (readError || !ride) {
    return failed("We couldn't find that ride.");
  }

  const startable: StartableRide = { status: ride.status, driverId: ride.driver_id };
  const decision = canStartTrip(startable, driver.id, driver.status);
  if (!decision.allowed) {
    return failed(decision.message);
  }

  const { data: started, error: updateError } = await service
    .from("rides")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .eq("id", rideId)
    .eq("status", "accepted")
    .eq("driver_id", driver.id)
    .select("id");

  if (updateError) {
    return failed("We couldn't start that trip. Try again in a moment.");
  }

  if (!started || started.length === 0) {
    return failed("This ride is no longer accepted. Reload and try again.");
  }

  return { ok: true, data: null };
}

/** How long to wait for `complete-ride` before giving up. Longer than Mapbox's 4s (`maps/server.ts`)
 * because completion holds a per-driver-month lock and may retry the compare-and-swap up to
 * `MAX_RATING_ATTEMPTS` times server-side before answering. */
const COMPLETE_RIDE_TIMEOUT_MS = 8_000;

export interface RideCompletion {
  readonly rideId: string;
  readonly status: string;
  readonly fareCents: number;
  readonly commissionRateBps: number;
  readonly commissionCents: number;
  readonly driverPayoutCents: number;
  readonly completedAt: string;
  readonly alreadyCompleted: boolean;
}

/** `RidesResult`'s two-shape union has no room for "and here's whether retrying would help" —
 * same reason `RequestRideOutcome` above is its own type rather than a `RidesResult`. */
export type CompleteRideOutcome =
  | { readonly kind: "completed"; readonly completion: RideCompletion }
  | { readonly kind: "failed"; readonly message: string; readonly retryable: boolean };

/**
 * Completes a ride by calling the deployed `complete-ride` Edge Function — the first call this
 * app has ever made to it. `complete-ride` has done the reading, the rating, and the
 * compare-and-swap write since ADR-0008; this function's only job is reaching it correctly and
 * translating what comes back.
 *
 * **Forwards the signed-in driver's own access token as the bearer.** `complete-ride`'s
 * `resolveCaller` also accepts the service-role key, but a `service_role` caller makes
 * `authorizeCompletion` skip the ownership and driver-active checks entirely (see
 * `supabase/functions/complete-ride/core.ts`) — which would move root `CLAUDE.md` invariant 6 out
 * of a tested pure function and into this one, untested. Forwarding the driver's token keeps
 * `authorizeCompletion` the real gate, exactly where ADR-0008 put it.
 *
 * `requireUser()`'s own `getUser()` call already verified this session against the auth server;
 * `getSession()` below only lifts that already-verified session's token for forwarding, doing no
 * further security work of its own — `complete-ride` re-verifies the token independently
 * (`admin.auth.getUser(token)`) regardless of how it arrived. `rideId` is never a value a person
 * types; it always comes from a `rides.id` this module itself just read, so it needs no UUID
 * validation here the way an externally-typed field would.
 */
export async function completeRide(rideId: string): Promise<CompleteRideOutcome> {
  await requireUser();

  const supabase = await createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return {
      kind: "failed",
      message: "You're signed out. Sign in again and retry.",
      retryable: false,
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return {
      kind: "failed",
      message: "Ride completion isn't configured. This one's ours to fix.",
      retryable: false,
    };
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/complete-ride`, {
      method: "POST",
      // A completion is never replayed from a cache — it's the one call in this codebase that
      // writes money, and `no-store` is the same non-negotiable maps/server.ts already applies to
      // a routed duration.
      cache: "no-store",
      signal: AbortSignal.timeout(COMPLETE_RIDE_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ rideId }),
    });
  } catch (error) {
    const { message, retryable } = completionErrorMessage({ raw: messageOf(error) });
    return { kind: "failed", message, retryable };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const raw =
      typeof (body as { error?: unknown })?.error === "string"
        ? (body as { error: string }).error
        : undefined;
    const { message, retryable } = completionErrorMessage({ status: response.status, raw });
    return { kind: "failed", message, retryable };
  }

  const success = body as {
    rideId: string;
    status: string;
    fareCents: number;
    commissionRateBps: number;
    commissionCents: number;
    driverPayoutCents: number;
    completedAt: string;
    alreadyCompleted: boolean;
  };

  return {
    kind: "completed",
    completion: {
      rideId: success.rideId,
      status: success.status,
      fareCents: success.fareCents,
      commissionRateBps: success.commissionRateBps,
      commissionCents: success.commissionCents,
      driverPayoutCents: success.driverPayoutCents,
      completedAt: success.completedAt,
      alreadyCompleted: success.alreadyCompleted,
    },
  };
}

/** How long a completed ride still shows the rider's trip-complete summary before the sheet
 * reverts to a plain "Where to?" form on the next load. A display heuristic only — no money or
 * lifecycle state depends on this number, unlike every timestamp it compares against. */
const COMPLETED_RIDE_FRESHNESS_MS = 5 * 60 * 1000;

export interface CompletedRideSummary {
  readonly id: string;
  readonly pickupAddress: string | null;
  readonly dropoffAddress: string | null;
  readonly fareCents: number;
  readonly completedAt: string;
}

/**
 * The rider's own most recently completed ride, if it finished within the freshness window —
 * what closes the loop visually once `getActiveRide()` goes back to `null` on completion.
 * Deliberately carries no commission or payout figures: those are the driver's, never the
 * rider's, to see.
 *
 * Swallows a read error into `null` rather than throwing, unlike `getActiveRide` — this backs a
 * dismissable summary, not the booking gate, so the honest degrade is silently falling back to
 * the plain form rather than failing the whole page over a nice-to-have.
 */
export async function getRecentlyCompletedRide(user: User): Promise<CompletedRideSummary | null> {
  const supabase = await createServerClient();
  const cutoff = new Date(Date.now() - COMPLETED_RIDE_FRESHNESS_MS).toISOString();

  const { data, error } = await supabase
    .from("rides")
    .select("id, pickup_address, dropoff_address, fare_cents, completed_at")
    .eq("rider_id", user.id)
    .eq("status", "completed")
    .gte("completed_at", cutoff)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || !data.completed_at) return null;

  return {
    id: data.id,
    pickupAddress: data.pickup_address,
    dropoffAddress: data.dropoff_address,
    fareCents: data.fare_cents,
    completedAt: data.completed_at,
  };
}
