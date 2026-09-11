// Exists only so Chrome's beforeinstallprompt eligibility check sees a registered service
// worker with a fetch handler — still required even though the browser's own menu-based
// "Install app" option dropped that requirement. This app's live ride/payment data must never
// be served stale from a cache (ADR-0027), so this handler does nothing but forward every
// request straight to the network — behaviorally identical to having no service worker at all.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => event.respondWith(fetch(event.request)));
