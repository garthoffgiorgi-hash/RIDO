# Deployment — Vercel

*What to do before hitting deploy, once. Not a description of Vercel itself.*

**Root Directory is `apps/web`.** Set this in the Vercel project's settings — it's a single npm
workspace monorepo, so Vercel's install step runs from the repo root regardless, but the build,
`vercel.json`, and every relative path below resolve from `apps/web`.

## The one mistake that 500s every page

`apps/web/src/proxy.ts` calls `createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, ...)` — the `!`
means Next's build will succeed even with the var unset, but the Supabase SSR client throws
synchronously the instant `proxy()` runs, on nearly every route (the matcher excludes only
`api/stripe` and `api/cron`). **Set every `NEXT_PUBLIC_*` var in Vercel's dashboard *before* the
first production build.** A `NEXT_PUBLIC_*` var is inlined at build time, not read at runtime —
adding it after a build means redeploying, not just saving.

## Env vars, by when they're read

| Var | Read | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Build time | See above. Missing = every page 500s |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Build time | `pk.` token, URL-restricted in the Mapbox dashboard to this domain + `localhost:3000` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Build time | `pk_test_...` until you mean it |
| `NEXT_PUBLIC_SITE_URL` | Build time | Used by `apps/web/src/app/robots.ts`/`sitemap.ts`. Set to the real domain, `https://...`, no trailing slash |
| `SUPABASE_SERVICE_ROLE_KEY` | Runtime | Bypasses RLS entirely — server-only, obviously |
| `MAPBOX_SECRET_TOKEN` | Runtime | `sk.` token — measures the trip a fare is priced from |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Runtime | The webhook secret is **per endpoint** — the deployed endpoint's own signing secret, not the one from `stripe listen` |
| `CRON_SECRET` | Runtime | ADR-0025. Missing = the sweep endpoint refuses every call, never the reverse |
| `RIDES_LIVE` | Runtime | ADR-0026. Missing or anything but the exact literal `true` = rides gated off, never the reverse |

Full descriptions of each: `apps/web/.env.example`.

## Prerequisites that are dashboard actions, not deploy steps

- **Supabase email dashboard config** — templates, custom SMTP, redirect allowlist. Required before
  a stranger can complete signup by email; without it, Supabase's built-in sender only reaches
  addresses in the project's own organisation. Full procedure: `auth-setup.md`.
- **Vercel Cron requires a Pro plan** for the sweep's 15-minute schedule (`vercel.json`) — Hobby
  only permits daily invocations.

## `RIDES_LIVE` (ADR-0026)

Leave unset for a public deploy before CPUC/insurance sign-off — the app is fully browsable
(marketing, signup, login, `/account`, driver compliance vetting) with booking, accepting, and
going online all refused server-side, and the two live-ride pages showing a plain "not yet
available" card. This is an engineering gate, not a legal determination — flipping it to `true`
still needs the sign-off `docs/roadmap.md`'s "Blocked on people, not code" table already names.

## Security headers — deliberately not shipped yet

No CSP or other security headers exist in `next.config.ts` today. A draft was scoped but not
applied: Next's App Router injects inline hydration `<script>` tags with no nonce, so a strict
`script-src` without `'unsafe-inline'` risks blank-paging the entire app — a failure mode only a
real browser against a real deploy can catch, not `next build`. **Before enabling one:**

1. Add it as `Content-Security-Policy-Report-Only` in `next.config.ts`'s `headers()` first, on a
   preview deployment — this reports violations without blocking anything.
2. Read the reports in a real browser loading `/request` (Stripe Elements + Mapbox GL) before ever
   switching to the enforcing header.
3. Hosts a real policy will need, gathered but unverified against live vendor docs from this
   sandbox: `js.stripe.com` (`script-src`, `frame-src`), `api.mapbox.com` / `events.mapbox.com`
   (`connect-src`), the Supabase project URL and its `wss://` host (`connect-src`), `blob:`
   (`worker-src`, for Mapbox GL's workers).
