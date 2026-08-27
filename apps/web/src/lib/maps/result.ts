/**
 * Every operation in this module returns a `MapsResult` rather than throwing or handing back a
 * raw Mapbox response.
 *
 * Same reasoning as `src/lib/auth/result.ts`, which this mirrors deliberately: a failure arrives
 * at a component already translated into RIDO's voice, so a component cannot render a vendor
 * error string because it never receives one.
 *
 * Two near-identical result types rather than one shared `Result<T>` is the intended shape.
 * ADR-0006's boundary is per-domain — a type shared across modules is the first thing that makes
 * "swapping a vendor touches one directory" stop being true.
 */
export type MapsResult<T = null> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly message: string };

/** Failure with a message already safe to show a user. */
export function failed(message: string): MapsResult<never> {
  return { ok: false, message };
}
