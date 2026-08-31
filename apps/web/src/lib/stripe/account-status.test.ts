import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  canReceiveTransfers,
  type ConnectAccountFacts,
  connectStatus,
  connectStatusMessage,
} from "./account-status.ts";

const facts = (over: Partial<ConnectAccountFacts> = {}): ConnectAccountFacts => ({
  payoutsEnabled: false,
  detailsSubmitted: false,
  currentlyDue: [],
  disabledReason: null,
  ...over,
});

describe("connectStatus", () => {
  it("reports not_started when no account exists at all", () => {
    assert.equal(connectStatus(null), "not_started");
  });

  it("reports incomplete for a fresh account with the form unfinished", () => {
    assert.equal(connectStatus(facts({ currentlyDue: ["external_account"] })), "incomplete");
  });

  it("reports enabled once payouts are on", () => {
    assert.equal(connectStatus(facts({ payoutsEnabled: true, detailsSubmitted: true })), "enabled");
  });

  it("distinguishes pending_verification from incomplete — the state Stripe leaves a driver in after they submit", () => {
    const submittedAndWaiting = facts({ detailsSubmitted: true, currentlyDue: [] });
    assert.equal(connectStatus(submittedAndWaiting), "pending_verification");

    const submittedButStillAsked = facts({ detailsSubmitted: true, currentlyDue: ["id_document"] });
    assert.equal(connectStatus(submittedButStillAsked), "incomplete");
  });

  it("reports restricted when Stripe gives a disabled_reason", () => {
    assert.equal(connectStatus(facts({ disabledReason: "requirements.past_due" })), "restricted");
  });

  it("treats a disabled_reason as more urgent than payouts_enabled, if both somehow appear", () => {
    const contradictory = facts({ payoutsEnabled: true, disabledReason: "under_review" });
    assert.equal(connectStatus(contradictory), "restricted");
  });
});

describe("canReceiveTransfers", () => {
  it("permits a transfer only when enabled", () => {
    assert.equal(canReceiveTransfers("enabled"), true);
    for (const status of [
      "not_started",
      "incomplete",
      "pending_verification",
      "restricted",
    ] as const) {
      assert.equal(canReceiveTransfers(status), false, `${status} must not permit a transfer`);
    }
  });
});

describe("connectStatusMessage", () => {
  it("says something for every status", () => {
    for (const status of [
      "not_started",
      "incomplete",
      "pending_verification",
      "restricted",
      "enabled",
    ] as const) {
      const message = connectStatusMessage(status);
      assert.ok(message.length > 0, `${status} has no message`);
    }
  });

  it("reassures the driver their money is safe in every state where it is held rather than sent", () => {
    // The states where a driver has earned but cannot yet be paid are exactly the ones where
    // silence reads as "my money is gone".
    for (const status of ["pending_verification", "restricted"] as const) {
      assert.match(connectStatusMessage(status), /safe/i, `${status} should reassure`);
    }
  });
});
