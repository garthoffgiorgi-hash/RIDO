import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { type DriverProfile, isActiveDriver } from "./status.ts";

/** Only `status` matters to `isActiveDriver`; the rest is filler to satisfy the row type. */
const profile = (status: string): DriverProfile =>
  ({
    id: "d0000000-0000-0000-0000-000000000001",
    auth_user_id: "a0000000-0000-0000-0000-000000000001",
    full_name: "Test Driver",
    email: null,
    phone: null,
    status,
    background_check_status: "passed",
    dmv_check_status: "passed",
    vehicle_inspection_status: "passed",
    vehicle_inspection_date: null,
    training_completed: true,
    vehicle_make: null,
    vehicle_model: null,
    vehicle_plate: null,
    vehicle_year: null,
    stripe_account_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }) as DriverProfile;

describe("isActiveDriver", () => {
  it("is true only for an active driver", () => {
    assert.equal(isActiveDriver(profile("active")), true);
  });

  it("is false for a pending driver", () => {
    assert.equal(isActiveDriver(profile("pending")), false);
  });

  it("is false for a suspended driver", () => {
    assert.equal(isActiveDriver(profile("suspended")), false);
  });

  it("is false for no driver profile at all", () => {
    assert.equal(isActiveDriver(null), false);
  });
});
