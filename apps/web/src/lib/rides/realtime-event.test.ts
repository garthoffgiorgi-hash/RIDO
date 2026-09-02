import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { advanceChannel, type ChannelLifecycle, FRESH_CHANNEL } from "./realtime-event.ts";

/** Feeds a sequence of statuses through and returns every refetch decision, in order. */
function replay(statuses: readonly string[]): boolean[] {
  let lifecycle: ChannelLifecycle = FRESH_CHANNEL;
  return statuses.map((status) => {
    const transition = advanceChannel(lifecycle, status);
    lifecycle = transition.lifecycle;
    return transition.refetch;
  });
}

describe("advanceChannel", () => {
  it("does not refetch on the first join — the server just rendered this page", () => {
    const transition = advanceChannel(FRESH_CHANNEL, "SUBSCRIBED");
    assert.deepEqual(transition, { lifecycle: { hasJoined: true }, refetch: false });
  });

  it("refetches on a re-join, because a status change may have happened while it was down", () => {
    const transition = advanceChannel({ hasJoined: true }, "SUBSCRIBED");
    assert.deepEqual(transition, { lifecycle: { hasJoined: true }, refetch: true });
  });

  for (const status of ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"] as const) {
    it(`does not refetch on ${status} — a request made while the socket is down fails too`, () => {
      assert.deepEqual(advanceChannel({ hasJoined: true }, status), {
        lifecycle: { hasJoined: true },
        refetch: false,
      });
    });

    it(`${status} does not erase that the channel had joined`, () => {
      // The bug this guards: if going down reset `hasJoined`, the re-join that follows would look
      // like a first join and refetch nothing — the exact case realtime exists to cover.
      const down = advanceChannel({ hasJoined: true }, status);
      assert.equal(advanceChannel(down.lifecycle, "SUBSCRIBED").refetch, true);
    });
  }

  it("ignores a status it does not recognise rather than treating it as a join", () => {
    // A future SDK release adding a status must be inert here, never a refetch on every callback.
    assert.deepEqual(advanceChannel(FRESH_CHANNEL, "REJOINING"), {
      lifecycle: FRESH_CHANNEL,
      refetch: false,
    });
  });

  it("refetches once per reconnect over a realistic drop-and-recover sequence", () => {
    const refetches = replay([
      "SUBSCRIBED", // page load
      "CHANNEL_ERROR", // wifi drops
      "TIMED_OUT",
      "SUBSCRIBED", // back — catch up
      "CLOSED", // tab backgrounded long enough to be dropped
      "SUBSCRIBED", // back again — catch up again
    ]);
    assert.deepEqual(refetches, [false, false, false, true, false, true]);
  });

  it("is pure — the lifecycle passed in is never mutated", () => {
    const lifecycle: ChannelLifecycle = { hasJoined: false };
    advanceChannel(lifecycle, "SUBSCRIBED");
    assert.deepEqual(lifecycle, { hasJoined: false });
  });
});
