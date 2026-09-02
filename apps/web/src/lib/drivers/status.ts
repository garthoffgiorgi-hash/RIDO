import type { Database } from "@/types/database.types";

/**
 * The driver domain — split from `src/lib/auth/`, which stays scoped to authentication itself
 * (session, sign-in/up, sign-out). Whether a signed-in user IS a driver is a separate question,
 * answered by whether a `drivers` row exists linking to their `auth_user_id` — deliberately no
 * `role` column. A person can hold both a rider and a driver identity at once; nothing here ever
 * has to pick one, because "book a ride" and "drive" are two independent yes/no facts, not a
 * single choice.
 *
 * This file is pure — no I/O, safe to import from a client component if one ever needs it. The
 * one function that talks to Supabase lives in `./server.ts`.
 */

/**
 * The whole generated `drivers` row, plus the one column the generated types don't know about yet.
 *
 * `accepting_rides` ships in `20260902130000_enable_driver_availability.sql` (ADR-0019); the
 * intersection is a **temporary** bridge until `npm run types:generate` runs against the pushed
 * migration, at which point it collapses back to the generated `Row` alone. Same documented
 * stopgap `src/lib/payouts/types.ts` and `src/lib/payments/types.ts` use, kept to one line here
 * because it's one column rather than a whole table.
 */
export type DriverProfile = Database["public"]["Tables"]["drivers"]["Row"] & {
  readonly accepting_rides: boolean;
};

/**
 * Whether this driver may currently accept rides.
 *
 * Mirrors the database's `drivers_activation_gate` constraint (root CLAUDE.md invariant 6) —
 * for UI messaging only. This is NOT the compliance boundary. The database CHECK constraint and
 * RLS are what actually stop an unqualified driver from going active; a wrong answer here would
 * show the wrong status text on a page, never let anyone actually drive.
 */
export function isActiveDriver(profile: DriverProfile | null): boolean {
  return profile?.status === "active";
}
