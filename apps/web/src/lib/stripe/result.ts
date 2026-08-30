/**
 * Mirrors `src/lib/maps/result.ts`, `src/lib/rides/result.ts`, `src/lib/fares/result.ts`,
 * `src/lib/commission/result.ts` — one `Result` type per domain, not a shared one, per ADR-0006.
 * A type shared across modules is the first thing that makes "swapping a vendor touches one
 * directory" stop being true.
 */
export type StripeResult<T = null> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly message: string };

/** Failure with a message already safe to show a user. */
export function failed(message: string): StripeResult<never> {
  return { ok: false, message };
}
