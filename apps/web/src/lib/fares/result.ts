/**
 * Mirrors `src/lib/auth/result.ts` and `src/lib/maps/result.ts` deliberately — one `Result` type
 * per domain, not a shared one, per ADR-0006. A component that receives a `FaresResult` cannot
 * render a raw Postgres error, because it never receives one.
 */
export type FaresResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly message: string };

/** Failure with a message already safe to show a user. */
export function failed(message: string): FaresResult<never> {
  return { ok: false, message };
}
