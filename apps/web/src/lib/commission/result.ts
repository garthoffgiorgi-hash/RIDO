/**
 * Mirrors `src/lib/fares/result.ts`, `src/lib/maps/result.ts`, `src/lib/rides/result.ts` — one
 * `Result` type per domain, not a shared one, per ADR-0006.
 */
export type CommissionResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly message: string };

/** Failure with a message already safe to show a user. */
export function failed(message: string): CommissionResult<never> {
  return { ok: false, message };
}
