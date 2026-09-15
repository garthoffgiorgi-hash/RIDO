/** The waitlist domain's own result type, per ADR-0006 — mirrors `src/lib/riders/result.ts`. */
export type WaitlistResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly message: string };

export function failed(message: string): { readonly ok: false; readonly message: string } {
  return { ok: false, message };
}
