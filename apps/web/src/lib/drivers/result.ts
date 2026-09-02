/**
 * The driver domain's own result type — one per domain, not a shared one, per ADR-0006. A caller
 * gets RIDO's words back, never a Supabase error object.
 */
export type DriversResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly message: string };

export function failed(message: string): { readonly ok: false; readonly message: string } {
  return { ok: false, message };
}
