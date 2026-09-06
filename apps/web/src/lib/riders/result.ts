/**
 * The rider domain's own result type — one per domain, not a shared one, per ADR-0006. Mirrors
 * `src/lib/drivers/result.ts` exactly.
 */
export type RidersResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly message: string };

export function failed(message: string): { readonly ok: false; readonly message: string } {
  return { ok: false, message };
}
