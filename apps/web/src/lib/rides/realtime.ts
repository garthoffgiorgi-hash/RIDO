"use client";

/**
 * Watching one ride change, over a websocket. The only file that touches Supabase Realtime.
 *
 * `@supabase/` is in `check-context.mjs`'s `VENDOR_SDKS`, so this could not live in a Client
 * Component even if someone wanted it to — the build fails, which is root invariant 7 and ADR-0006
 * enforced by a tool rather than by review. Shaped like `src/lib/maps/map.ts` and
 * `src/lib/payments/browser.ts`: take a small set of RIDO-shaped arguments, return an **opaque
 * handle**, and let no vendor type escape. A caller that only ever sees `RideSubscription` cannot
 * grow a dependency on a `RealtimeChannel` detail.
 *
 * This is the first consumer anywhere of `src/lib/supabase/client.ts`. That file has existed as
 * dead code since it was written — every byte that reached a Client Component until now was a
 * server prop or a Server Action return.
 *
 * **`onChange` takes no arguments, and that is the whole design (ADR-0020).** A postgres_changes
 * event carries the whole new row, and handing it to the caller would invite patching local state
 * from it — which cannot work here and must not be attempted. `DriverActiveRide.driverPayoutCents`
 * and `.commissionRateBps` do not exist on an `'accepted'`/`'in_progress'` row at all
 * (`rides_commission_present_iff_completed` guarantees they are null); `getDriverActiveRide()`
 * computes them live through `commissionForRide()`, and root invariant 5 forbids producing them any
 * other way. So the event is a bare notification: "this ride moved." The caller refetches through
 * the same server read a page load uses, and the payload is discarded here, unread.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase/client.ts";
import { advanceChannel, type ChannelLifecycle, FRESH_CHANNEL } from "./realtime-event.ts";

/** What a live subscription can do. Deliberately one verb; no Supabase type crosses this line. */
export interface RideSubscription {
  /** Tears down the channel and its socket registration. Call from a cleanup effect. */
  unsubscribe(): void;
}

/**
 * Watches one ride for any change and calls `onChange` when it moves.
 *
 * @param rideId the ride to watch — a single row, matched server-side by the Realtime filter.
 * @param onChange fired on every change to that row, and again after a reconnect that may have
 *   missed one. Takes no arguments by design (see the module docstring). Must be idempotent: the
 *   subscriber's own writes echo back over the socket, so it will be called for changes the caller
 *   already applied optimistically.
 *
 * Returns synchronously so a `useEffect` can hold the handle and clean it up on the same tick,
 * even though joining the channel is asynchronous. A subscription torn down before it finishes
 * joining is handled: `unsubscribe()` sets a flag the async setup checks before it goes any
 * further, so an unmount that races the join leaves nothing behind.
 */
export function subscribeToRide(rideId: string, onChange: () => void): RideSubscription {
  const supabase = createBrowserClient();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;
  let lifecycle: ChannelLifecycle = FRESH_CHANNEL;

  const teardown = () => {
    if (!channel) return;
    // `removeChannel`, NOT `channel.unsubscribe()`. The latter closes the connection but leaves a
    // dead entry behind in the client's channel registry, which leaks one entry per mount — and
    // React StrictMode double-invokes every effect in development, so it leaks on the first render
    // of every page in dev before it ever leaks in production.
    void supabase.removeChannel(channel);
    channel = null;
  };

  void (async () => {
    // **Load-bearing, and silently fatal if removed.** `RealtimeChannel.subscribe()` builds its
    // join payload from `socket.accessTokenValue`, and the only thing that populates that is an
    // *asynchronous* auth call the socket kicks off during `connect()`. Subscribe before it lands
    // and the channel joins carrying no token at all — under RLS that matches no policy on `rides`,
    // so the channel reports SUBSCRIBED and then delivers ZERO EVENTS, with no error anywhere. This
    // await is what makes the token deterministically present before the join.
    //
    // Called with **no argument** on purpose. supabase-js constructs its `RealtimeClient` with an
    // `accessToken` callback wired to the session, and a no-arg `setAuth()` resolves through that
    // callback — so the client stays in callback mode and keeps refreshing the token on heartbeat.
    // Passing a token explicitly would work today and expire an hour later on a long ride.
    await supabase.realtime.setAuth();
    if (cancelled) return;

    channel = supabase
      .channel(`ride:${rideId}`)
      .on(
        "postgres_changes",
        // No `event: "UPDATE"` — a ride is watched for *any* change. UPDATE is what actually
        // happens today (accept, start, complete, cancel are all updates), but narrowing the
        // filter to it would mean a future DELETE or a re-INSERT silently stopped notifying, and
        // this handler costs the same either way since it reads nothing from the payload.
        { event: "*", schema: "public", table: "rides", filter: `id=eq.${rideId}` },
        // The payload is deliberately not a parameter here. See the module docstring.
        () => onChange(),
      )
      .subscribe((status) => {
        const transition = advanceChannel(lifecycle, status);
        lifecycle = transition.lifecycle;
        // A re-join means the socket was down, and a status change during that window produced an
        // event nobody received. Refetching here is the entirety of "reconnect is silent": the
        // screen catches up on its own rather than rendering a connection state nobody can act on.
        if (transition.refetch) onChange();
      });
  })();

  return {
    unsubscribe() {
      cancelled = true;
      teardown();
    },
  };
}
