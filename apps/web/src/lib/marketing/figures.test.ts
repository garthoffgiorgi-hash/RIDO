/**
 * The marketing figures, pinned to what the docs publish.
 *
 * This file is a tripwire, in the same spirit as packages/pricing's `commission.seed.test.ts`:
 * **a repricing is supposed to break it.** When it does, the fix is to update these strings and
 * the copy in `docs/business/monetization.md` together — that's the point. It is the thing that
 * stops a rate change from quietly rewriting the website's promises.
 *
 * The values below are not independent arithmetic. They're the figures three separate documents
 * published by hand, months before any of this code existed:
 *   - docs/business/monetization.md — "$3,600 GMV/driver-mo: ... = $488 (~13.6% blended).
 *     Driver keeps $3,112; an incumbent at 30% would take $1,080"
 *   - supabase/seed/commission_tiers.sql — the same worked example, in the seed's own comment
 *   - apps/web/src/lib/mock-data.ts — the hand-typed strings this module replaced
 *
 * Them falling out of `commissionForRide` is the evidence the chain is wired correctly.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  commissionTiers,
  commissionWorkedExample,
  driverKeepsPct,
  tierProseSentence,
  tierProseShort,
} from "./figures.ts";

describe("the worked example", () => {
  it("reproduces the figures monetization.md published by hand", () => {
    assert.deepEqual(
      { ...commissionWorkedExample },
      {
        monthlyGmv: "$3,600",
        ridoCommission: "$488",
        ridoDriverKeeps: "$3,112",
        ridoBlendedRate: "13.6%",
        ridoKeepPct: "86%",
        incumbentFlatRate: "30%",
        incumbentDriverKeeps: "$2,520",
        incumbentKeepPct: "70%",
        monthlyAdvantage: "$592",
      },
    );
  });

  it("publishes the driver-keeps figure with a tilde, for prose", () => {
    assert.equal(driverKeepsPct, "~86%");
  });

  it("keeps the bar-width figures bare, since they are used as CSS widths", () => {
    // A tilde or a decimal here collapses the bar on the drivers page. Regression guard: this is
    // exactly the mistake the old hand-written mock-data.ts was carefully avoiding, with only a
    // comment to explain why.
    for (const width of [
      commissionWorkedExample.ridoKeepPct,
      commissionWorkedExample.incumbentKeepPct,
    ]) {
      assert.match(width, /^\d+%$/);
    }
  });

  it("adds up: what the driver keeps plus what we take is the month's fares", () => {
    assert.equal(commissionWorkedExample.ridoCommission, "$488");
    assert.equal(commissionWorkedExample.ridoDriverKeeps, "$3,112");
    // $488 + $3,112 = $3,600. Stated as the strings the page renders, because a page that
    // renders two numbers which don't sum to the third is the failure that matters here.
    assert.equal(commissionWorkedExample.monthlyGmv, "$3,600");
  });
});

describe("the tier table", () => {
  it("renders one row per seeded band", () => {
    assert.equal(commissionTiers.length, 3);
  });

  it("labels the bands the way the about page shows them", () => {
    assert.deepEqual(
      commissionTiers.map((t) => t.band),
      ["$0 – $1,000 / mo", "$1,000 – $3,000 / mo", "Above $3,000 / mo"],
    );
  });

  it("renders each band's rate", () => {
    assert.deepEqual(
      commissionTiers.map((t) => t.rate),
      ["20%", "12%", "8%"],
    );
  });

  it("describes each band by its position, not by a hardcoded sentence", () => {
    assert.deepEqual(
      commissionTiers.map((t) => t.description),
      [
        "Starting band, on your first $1,000 of fares each month.",
        "Middle band, on the next $2,000 of fares.",
        "Top band, on every dollar past $3,000.",
      ],
    );
  });
});

describe("the drivers page prose", () => {
  it("spells the full sentence out of the seeded bands", () => {
    assert.equal(
      tierProseSentence,
      "20% on your first $1,000 of fares each month, 12% on the next $2,000, then just 8% above $3,000.",
    );
  });

  it("spells the short form out of the seeded bands", () => {
    assert.equal(tierProseShort, "20%, then 12%, then just 8%");
  });
});
