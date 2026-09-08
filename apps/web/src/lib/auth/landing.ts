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
