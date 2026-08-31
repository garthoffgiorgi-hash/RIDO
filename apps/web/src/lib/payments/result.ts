/**
 * Mirrors `src/lib/payouts/result.ts` and its siblings — one `Result` type per domain, not a
 * shared one, per ADR-0006. Taking money in and paying it out fail in different ways and speak to
 * different people; a shared type would invite a shared vocabulary they do not have.
 */
export type PaymentsResult<T = null> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly message: string };

/** Failure with a message already safe to show a rider. */
export function failed(message: string): PaymentsResult<never> {
  return { ok: false, message };
}
