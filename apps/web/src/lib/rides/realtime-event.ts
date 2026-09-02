/**
 * The one piece of realtime that is pure logic: deciding, from a channel's status callback alone,
 * whether the caller has to refetch.
 *
 * Split out from `realtime.ts` for the same reason `accept.ts` is split from `server.ts` — the rule
 * is testable without a socket, a browser, or a Supabase project, and ADR-0007's bar is that pure
 * logic in `src/lib/` ships with its tests. `realtime.ts` keeps the vendor SDK and nothing else.
 *
 * **The rule this file encodes.** A ride's status can change while the socket is down. The client
 * gets no event for it — the change happened, the notification did not. So when the channel comes
 * back, the screen may be stale in a way no event will ever correct. Refetching on every re-join is
 * what makes the silent-reconnect decision (ADR-0020, §4) actually hold: no "reconnecting…"
 * indicator, because the screen just catches up by itself.
 *
 * The mirror case matters as much: the **first** join must NOT refetch. The server rendered this
 * page moments ago and handed the panel its initial state as a prop; a refetch there is a wasted
 * round trip on every single page load, at exactly the moment the user is waiting for the screen.
 */

/**
 * What Supabase's `.subscribe()` callback reports. Named here rather than imported so no vendor
 * type crosses into this module — `realtime.ts` passes the raw string across and this file owns
 * the vocabulary, the same division `completion-errors.ts` holds for `complete-ride`'s HTTP codes.
 */
export type ChannelStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

/**
 * Everything worth remembering about a channel between status callbacks. One boolean, because one
 * boolean is genuinely all the rule needs: "has this channel ever been joined before?"
 */
export interface ChannelLifecycle {
  readonly hasJoined: boolean;
}

/** A channel that has not joined yet. The starting state for every new subscription. */
export const FRESH_CHANNEL: ChannelLifecycle = { hasJoined: false };

export interface ChannelTransition {
  /** Carry this forward into the next call. */
  readonly lifecycle: ChannelLifecycle;
  /** True when the caller must refetch: the channel re-joined after having previously joined. */
  readonly refetch: boolean;
}

/**
 * Advances the lifecycle by one status callback, and says whether that transition means the screen
 * might be stale.
 *
 * Takes `status` as a bare `string` rather than `ChannelStatus`: the value arrives from a vendor
 * SDK at runtime, so narrowing it at the type level would be a claim this function cannot check.
 * Anything it does not recognise leaves the lifecycle untouched and asks for no refetch — a new
 * status string in a future SDK release should be inert, never a refetch storm.
 */
export function advanceChannel(lifecycle: ChannelLifecycle, status: string): ChannelTransition {
  if (status !== "SUBSCRIBED") {
    // CHANNEL_ERROR, TIMED_OUT and CLOSED all mean the same thing here: events may now be missed.
    // Nothing to do about it yet — the refetch belongs on the way back up, not on the way down,
    // because a refetch issued while the connection is broken is a request that will also fail.
    return { lifecycle, refetch: false };
  }

  return { lifecycle: { hasJoined: true }, refetch: lifecycle.hasJoined };
}
