/**
 * The post-login landing rule (ADR-0023). Pure — takes what's already been read, decides nothing
 * about how to read it, so it's testable without a database and reusable if a second caller ever
 * needs the same decision.
 *
 * An explicit `next` always wins: someone bounced off a specific page by `proxy.ts`, or who
 * clicked a specific link, is telling you where they meant to go. Absent that, a live ride is a
 * FACT about what someone is doing right now, not a guess about which identity they favour — the
 * distinction that keeps this from being the identity-split ADR-0022 and this repo's CLAUDE.md
 * files already argued against. Driver side wins the rare both-at-once tiebreak: a passenger
 * waiting on you is the higher obligation. Absent any of that, `/account` — today's behaviour,
 * unchanged.
 */
export interface LandingSignals {
  readonly explicitNext: string | null;
  readonly hasDriverRide: boolean;
  readonly hasRiderRide: boolean;
}

export function landingPath(signals: LandingSignals): string {
  if (signals.explicitNext) return signals.explicitNext;
  if (signals.hasDriverRide) return "/drive";
  if (signals.hasRiderRide) return "/request";
  return "/account";
}

/** Just the two facts the ride check supplies — `explicitNext` comes from the URL, not a read. */
export type RideSignals = Omit<LandingSignals, "explicitNext">;

const NO_RIDES: RideSignals = { hasDriverRide: false, hasRiderRide: false };

/**
 * Runs the ride check, degrading to "no live ride" if it fails for any reason.
 *
 * **This is a guard on the critical path for every sign-in, not defensive habit.** The reads it
 * wraps (`getOwnDriverProfile`, `hasActiveDriverRide`, `hasActiveRiderRide`) all throw on a
 * Supabase error, and their only caller is a **Route Handler** — which `app/error.tsx` does not
 * cover, because that boundary catches errors thrown while *rendering* a route. Unguarded, a
 * transient database blip during sign-in is a raw, unbranded 500 with no way forward, for every
 * user, on the one request they cannot avoid making.
 *
 * Degrading to `/account` is the correct answer rather than a consolation prize: the landing rule
 * is an optimization over where sign-in used to send everyone unconditionally, so losing it costs
 * a tap, not correctness. An explicit `next` is unaffected — it never depended on this read, and
 * `landingPath` still honours it on the degraded path.
 *
 * Takes the read as an argument so the degrade is testable without a database.
 */
export async function rideSignalsOrNone(read: () => Promise<RideSignals>): Promise<RideSignals> {
  try {
    return await read();
  } catch (cause) {
    console.error("auth/landing: ride check failed, falling back to /account", { cause });
    return NO_RIDES;
  }
}
