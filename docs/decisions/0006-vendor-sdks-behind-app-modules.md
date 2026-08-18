# ADR-0006 — Vendor SDKs are reached through an app-owned module, never from a component

**Status:** Accepted
**Date:** 2026-08-18

## Context

The first auth implementation put roughly a dozen raw `supabase.auth.*` calls directly into page
components. Every rule the flows depend on travelled as a convention repeated at each call site:
pass `shouldCreateUser: false` so signing in can't silently register someone, pass
`emailRedirectTo` so the emailed link lands on `/auth/confirm` instead of Supabase's hosted page,
normalise the phone number to E.164 before it leaves.

One of them was already wrong. The login page shipped with `shouldCreateUser: true`, so typing an
unknown address into a form labelled "Log in" minted an account — and could be used to send mail
to arbitrary addresses. Nothing in the codebase made that a mistake rather than a choice; it
looked exactly like the correct code.

Two further costs came with it. The flows could only be exercised by rendering React, which is
why none of them were tested. And raw vendor error strings reached the UI, which is both
off-voice and a way to leak whether an account exists.

The stack has three more vendor SDKs coming — Stripe for subscriptions and Connect, Mapbox for
maps, and Supabase's data client for every table read. Each carries the same shape of risk, and
the money and compliance paths are where it would hurt most.

## Decision

**A third-party SDK is called from an app-owned module under `apps/web/src/lib/<domain>/`, and
from nowhere else.** Components, route handlers, and Server Components call our functions.

- `src/lib/supabase/` is the wiring layer: it constructs clients and nothing more. **Domain
  modules consume it; components do not import it directly.**
- `src/lib/auth/` is the first of these modules and the reference implementation. `browser.ts`
  and `server.ts` split by runtime, `errors.ts` translates vendor errors into RIDO's voice, and
  `result.ts` defines the `AuthResult` every operation returns.
- Operations return **app-shaped results**, not vendor types and never a raw vendor error. A
  component that cannot receive a vendor error cannot render one.
- A rule that must always hold is set **inside** the module, not passed in by callers. Callers
  don't pass `shouldCreateUser`, so they cannot forget it.

Reading data follows the same shape as it arrives: a component that needs rides calls a
`src/lib/rides/` function, not a Supabase query builder inline in JSX.

## Consequences

- Each rule has one home and one diff. "Login never creates accounts" is now a property of the
  codebase rather than a thing to remember.
- The flows are testable without a DOM — they're functions taking arguments and returning a
  tagged result. That removes the stated reason there were no tests. (ADR-0007)
- Swapping or upgrading a vendor touches one directory. This matters more than it sounds: the
  Supabase client's own API for cookie handling changed shape once already during this build.
- Indirection cost is real but small — a named function per operation, and one file to open to
  see every way the app talks to a vendor.
- **Enforcement is by review and by this ADR, not by a tool.** `scripts/check-context.mjs` does
  not yet detect a vendor import in a component. Worth adding when the second module lands.
