/**
 * Mirrors `src/lib/rides/result.ts` and its siblings — one `Result` type per domain, not a shared
 * one, per ADR-0006.
 */
export type PayoutsResult<T = null> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly message: string };

/** Failure with a message already safe to show a user. */
export function failed(message: string): PayoutsResult<never> {
  return { ok: false, message };
}
