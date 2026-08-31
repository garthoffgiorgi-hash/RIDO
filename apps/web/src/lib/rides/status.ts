/**
 * The ride lifecycle, as a type instead of a comment. `complete-ride/core.ts` names the chain in
 * a docstring — "requested -> accepted -> in_progress -> completed" — which is the repo's only
 * written state machine before this file. `rides.status` is `text` plus a `CHECK` constraint in
 * the database (root pattern: extending a `CHECK` is a plain `ALTER`, unlike a native enum), so
 * this union has to be kept in sync by hand — Postgres has no type to export.
 *
 * Pure — no I/O, safe to import from a client component. The functions that touch Supabase live
 * in `./server.ts`.
 */
export type RideStatus = "requested" | "accepted" | "in_progress" | "completed" | "canceled";

/** Every status `rides_one_active_per_rider` treats as "still live" — mirrors that index's WHERE. */
export const ACTIVE_STATUSES: readonly RideStatus[] = ["requested", "accepted", "in_progress"];

export function isActiveStatus(status: RideStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/**
 * Whether a RIDER may cancel a ride in this status **for free**.
 *
 * The question this once asked — "may they cancel at all" — has been answered more fully by
 * `cancellationOutcome()` in `./cancellation.ts` (ADR-0018): a rider may now also cancel an
 * `'accepted'` or `'in_progress'` ride, for a fee, which is the product decision this function's
 * previous docstring deferred to "that PR".
 *
 * It survives because "is this cancel free" is still a real and separate question, and because it
 * is the one a component can answer without a rate card: `/request` renders its Cancel button
 * unconditionally now, but the *confirmation* it shows depends on whether money is involved.
 *
 * **Server-side authority lives in `cancellationOutcome()`, not here.** This is a display rule; a
 * fee is decided against the grace window and the ride's `accepted_at`, both of which this
 * signature deliberately does not take.
 */
export function canRiderCancel(status: RideStatus): boolean {
  return status === "requested";
}
