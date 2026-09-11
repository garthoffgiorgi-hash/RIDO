# ADR-0027 — A service worker exists, and it does nothing but forward requests

**Status:** Accepted
**Date:** 2026-09-11

## Context

The PWA groundwork (manifest, icons, standalone meta tags) shipped with no service worker at
all, deliberately: this app's live ride and payment data must never be served stale from a cache.
The next step — a banner on the marketing/login/signup pages offering to install the app, with a
real one-tap button on Android — needs Chrome to fire `beforeinstallprompt`. Chrome dropped the
service-worker requirement for its own menu-based "Install app" option (Chrome 108 mobile / 112
desktop), but the algorithm that fires `beforeinstallprompt` still requires a registered service
worker with a `fetch` handler. Without one, Android gets the same instructional card iOS does —
no real button, since there is nothing to call `.prompt()` on.

## Decision

**A service worker exists (`apps/web/public/sw.js`), and it must remain fetch-passthrough-only.**
Its `fetch` handler does nothing but `event.respondWith(fetch(event.request))` — no
`caches.open`/`.put`/`.match` anywhere, so it is behaviorally identical to having no service
worker at all except that Chrome's eligibility check now sees a qualifying `fetch` handler. Any
future need to actually cache something is a new ADR that explicitly supersedes this constraint,
not a quiet edit to this file.

Registration lives inside `InstallPrompt.tsx` (`navigator.serviceWorker.register("/sw.js", {
scope: "/" })`), not the root layout. Service worker registration is origin-scoped, not
page-scoped: once registered from any of the pages `InstallPrompt` mounts on, it controls fetches
for the whole origin — including `/request`/`/drive` — with no root-layout change needed.

**The captured `beforeinstallprompt` event lives in a module-scope singleton, not component
state.** `/login`/`/signup` share no layout with the marketing pages or each other, so a normal
`<Link>` navigation between them unmounts whichever `InstallPrompt` instance caught the event.
Chrome fires it at most once per page load — losing it in local state would silently strand it
for the rest of that tab's session, the exact kind of gap ADR-0021 already named honestly for a
different realtime edge case. A module-level singleton survives any number of mount/unmount
cycles for the life of the tab, so the button still appears wherever the visitor lands next.

## Consequences

- The Android install button is real, not a mocked-up card: it fires on the browser's own
  `beforeinstallprompt`, decided by `installPromptVariant()` (`apps/web/src/lib/pwa/install-prompt.ts`),
  and calls the actual `.prompt()`.
- Every page under this origin is now served through a service worker, forever, once any visitor
  loads one of the five pages that register it — including pages this feature never renders on.
  That is accepted, not incidental: the worker is a no-op passthrough, so it changes nothing about
  what any page actually serves.
- Nothing here weakens the invariant that motivated skipping a service worker in the first place.
  A reviewer checking this file's own `fetch` handler is the whole audit — there is no cache to
  reason about going stale.

## Supersedes

Nothing. Narrows, rather than reopens, the no-caching posture the PWA groundwork established.
