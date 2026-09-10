/**
 * Whether RIDO is allowed to dispatch a real ride right now — an engineering gate, not a legal
 * determination (ADR-0026). Setting `RIDES_LIVE=true` asserts nothing about CPUC permit or
 * insurance status; it only stops enforcing the block this file exists to enforce. Whether flipping
 * it is actually safe is a call for the insurance broker and the CA attorney already on
 * `docs/roadmap.md`'s "Blocked on people, not code" table — not something this file can decide.
 *
 * Same posture `CRON_SECRET` already takes in `app/api/cron/sweep-stuck-money/route.ts`: "a missing
 * secret must never degrade into an open endpoint." Here, a missing or malformed flag must never
 * degrade into live rides — only the exact literal `"true"` enables anything.
 *
 * Deliberately carries no `import "server-only"`, unlike `./server.ts` — the same split
 * `./accept.ts`/`./cancellation.ts` already draw in this directory: a pure, colocated-tested file
 * next to the impure one, since `server-only` only resolves through Next's bundler and would break
 * `live.test.ts` under a plain `node --test` run. Nothing here is sensitive: a `RIDES_LIVE` read
 * that somehow reached a browser bundle would see `undefined`, not the real value, and resolve to
 * `false` — the fail-safe direction regardless of where it runs.
 */

/** Pure so the fail-safe default is provable without touching `process.env`. */
export function parseRidesLive(rawValue: string | undefined): boolean {
  return rawValue === "true";
}

export function ridesAreLive(): boolean {
  return parseRidesLive(process.env.RIDES_LIVE);
}

/**
 * The one message every gate below shows, so a rider blocked from booking and a driver blocked
 * from accepting or going online all read the same explanation rather than three near-miss copies.
 */
export const RIDES_NOT_LIVE_MESSAGE = "Not accepting rides in this area yet — check back soon.";
