// GENERATED FILE — DO NOT EDIT.
//
// Written by scripts/generate-published-tiers.mjs from supabase/seed/commission_tiers.sql,
// which is the single home for RIDO's rates. Editing this file by hand makes the website
// disagree with the database; CI runs the generator with --check and fails if they differ.
//
// To change a rate: edit the seed, run `npm run generate:tiers`, commit both.
// Full procedure: docs/business/changing-rates.md
//
// Effective from 2026-01-01.

import type { CommissionTier } from "@rido/pricing";

/** The active bands, exactly as seeded. Ordered by tier_order. */
export const PUBLISHED_TIERS: readonly CommissionTier[] = [
  { tierOrder: 1, lowerBoundCents: 0, upperBoundCents: 100000, rateBps: 2000 },
  { tierOrder: 2, lowerBoundCents: 100000, upperBoundCents: 300000, rateBps: 1200 },
  { tierOrder: 3, lowerBoundCents: 300000, upperBoundCents: null, rateBps: 800 },
];
