/**
 * Every operation in this module returns an `AuthResult` rather than throwing or handing back a
 * raw Supabase error.
 *
 * The point is that a failure arrives at a component already translated into RIDO's voice —
 * a component cannot accidentally render a vendor error string, because it never receives one.
 * That's the rule in `apps/web/CLAUDE.md` made structural instead of advisory.
 */
export type AuthResult<T = null> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly message: string };

/** Success carrying no payload — the common case. */
export const succeeded: AuthResult<null> = { ok: true, data: null };

/** Failure with a message already safe to show a user. */
export function failed(message: string): AuthResult<never> {
  return { ok: false, message };
}
