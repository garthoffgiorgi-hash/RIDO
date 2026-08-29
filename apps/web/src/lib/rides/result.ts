/**
 * Mirrors `src/lib/auth/result.ts`, `src/lib/maps/result.ts` and `src/lib/fares/result.ts`
 * deliberately — one `Result` type per domain, not a shared one, per ADR-0006.
 */
export type RidesResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly message: string };

/** Failure with a message already safe to show a user. */
export function failed(message: string): RidesResult<never> {
  return { ok: false, message };
}
