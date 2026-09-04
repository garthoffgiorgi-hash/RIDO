# Supabase Auth — project configuration

**The code is not the whole system.** Auth depends on Supabase dashboard settings that live in no
file and survive no `git clone`. Everything below is configured by hand, per project, and each
item fails *silently* when it's missing — the app sees a success response and the user sees
nothing arrive.

Governs: Supabase Auth dashboard configuration. The code side is `apps/web/CLAUDE.md`.

## 1. Email templates — required for any email link to work

Supabase's default "Confirm signup" and "Magic Link" templates point at **Supabase's own hosted
verify endpoint**, not at this app. Out of the box the app's `/auth/confirm` route never receives
a token, so clicking the emailed link does nothing at all.

Under **Authentication → Email Templates**, rebuild each link's `href`:

| Template | `href` |
|---|---|
| Confirm signup | `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup` |
| Magic Link | `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=magiclink` |

`{{ .RedirectTo }}` already carries the `emailRedirectTo` the app sent, so one template works in
local, preview, and production without touching Site URL.

**Confirm signup must also render `{{ .Token }}` somewhere in the body.** That's the six-digit
code; `/signup`'s code-entry step verifies against the raw OTP, not the hash. The default
template doesn't include it, which is why a fresh project emails a link and no code.

## 2. Redirect allowlist

**Authentication → URL Configuration → Redirect URLs** must contain each environment's origin —
`http://localhost:3000/**` for local dev, plus the Vercel preview and production origins.

Supabase silently drops an `emailRedirectTo` that isn't allowlisted. The app never sees an error;
the link just goes somewhere else.

## 3. Custom SMTP — required before anyone outside the team can sign up

Without custom SMTP, Supabase's built-in sender **only delivers to addresses belonging to the
project's own organisation members.** Every other address fails with `Email address not
authorized`, and it is rate-limited to a handful of messages an hour besides.

This is fine for testing with the founder's own address and is a hard blocker for real users.
Configure under **Authentication → Emails → SMTP Settings** with any provider (Resend, SendGrid,
Postmark) once a sending domain is verified.

## 4. SMS provider — required for any phone flow

Phone sign-up and phone sign-in need an SMS provider configured under **Authentication →
Providers → Phone** (Twilio, MessageBird, Vonage). All are paid; there is no free tier equivalent
to the built-in email sender.

Until one is configured, every phone flow errors. `authErrorMessage()` catches this case and says
so plainly rather than showing a generic failure.

## 5. Creating a test account without fixing 1–3 first

Useful for a second driver account today, or any testing before templates and SMTP are set up:
none of items 1–3 above have to be fixed for this to work, because it skips email entirely.

**Authentication → Users → Add user**, check **Auto Confirm User**. That creates a confirmed
`auth.users` row directly — no email round-trip, so the built-in sender's organisation-only
restriction (item 3) never comes into play.

**This does not test the real signup flow.** It proves nothing about the email templates or
`/auth/confirm` — it is a way to get a second account past the auth layer while those stay broken,
not a substitute for fixing them.

A driving test account also needs a `drivers` row — there is no self-serve "become a driver" flow
(root `CLAUDE.md`, `apps/web/CLAUDE.md`'s Rider/driver section), only service-role/admin creation.
Run this in the project's SQL editor, once the user above exists:

```sql
insert into drivers (
  auth_user_id, full_name, email,
  status, background_check_status, dmv_check_status, vehicle_inspection_status
)
select id, 'Test Driver Two', email,
       'active', 'passed', 'passed', 'passed'
from auth.users
where email = 'the address you just created';
```

`status = 'active'` requires both check columns `'passed'` — `drivers_activation_gate` (root
CLAUDE.md invariant 6) refuses any other combination, the same gate a real vetted driver has to
clear. `accepting_rides` defaults to `true`, so this account is online and visible in the open pool
immediately; no separate step needed to bring it online for a cross-driver test.

## Known-good local values

| Setting | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` — **no path suffix.** The dashboard sometimes displays it with `/rest/v1/` appended; including that breaks every auth call with `Failed to fetch`, because the SDK appends its own paths. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The `sb_publishable_…` key |
| `SUPABASE_SERVICE_ROLE_KEY` | The `sb_secret_…` key. Server-only, never `NEXT_PUBLIC_` |

Legacy `eyJ…` JWT-style keys still work, but new projects issue the `sb_*` format and legacy keys
can no longer be rotated in place — a compromised one is replaced by issuing a new secret key and
deleting the old.
