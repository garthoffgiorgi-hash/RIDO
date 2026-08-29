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
 * Whether a RIDER may cancel a ride in this status.
 *
 * Only `'requested'`: this PR builds no driver-side accept, so nothing here ever produces
 * `'accepted'` or `'in_progress'` yet — drawing the line anywhere past `'requested'` would be
 * designing for a state nothing can reach. Once accept exists, whether a rider can still cancel
 * after a driver has committed is a real product decision (a fee? a driver notification?) that
 * belongs with that PR, not assumed here.
 */
export function canRiderCancel(status: RideStatus): boolean {
  return status === "requested";
}
