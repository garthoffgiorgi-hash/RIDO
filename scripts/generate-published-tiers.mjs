#!/usr/bin/env node
/**
 * generate-published-tiers.mjs — makes the marketing site's rates derived rather than retyped.
 *
 * The problem it solves: `supabase/seed/commission_tiers.sql` is the one home for RIDO's rates
 * (root CLAUDE.md, and scripts/check-context.mjs enforces it by forbidding tier literals in code).
 * But the marketing pages have to *state* those rates, and until now they did it by hand — the
 * "~86%", the band table, and two separate prose spellings of "20% / 12% / 8%" on the drivers
 * page. Change a rate in the database and the website keeps saying the old one.
 *
 * So: this reads the seed and writes a TypeScript module. `apps/web/src/lib/marketing/figures.ts`
 * then runs the real `commissionForRide` over those bands to derive every published figure. The
 * seed stays the single source; the copy follows it.
 *
 *   node scripts/generate-published-tiers.mjs           # write the file
 *   node scripts/generate-published-tiers.mjs --check    # fail if it's stale (CI)
 *
 * The generated file is the ONE place outside the seed and the docs where tier values legally
 * appear in code, and check-context.mjs allowlists exactly that path — a narrow, generated,
 * never-hand-edited exception rather than a hole.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEED = resolve(ROOT, "supabase/seed/commission_tiers.sql");
const OUT = resolve(ROOT, "apps/web/src/lib/marketing/published-tiers.generated.ts");
const CHECK_ONLY = process.argv.includes("--check");

const die = (message) => {
  console.error(`generate-published-tiers: ${message}`);
  process.exit(1);
};

/** Strip `-- line comments` without touching anything inside single quotes. */
function stripComments(sql) {
  let out = "";
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inString) {
      out += ch;
      if (ch === "'") inString = false;
      continue;
    }
    if (ch === "'") {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    out += ch;
  }
  return out;
}

/** Split a parenthesised tuple body on top-level commas, respecting quotes and nesting. */
function splitTuple(body) {
  const parts = [];
  let current = "";
  let depth = 0;
  let inString = false;
  for (const ch of body) {
    if (inString) {
      current += ch;
      if (ch === "'") inString = false;
      continue;
    }
    if (ch === "'") inString = true;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current.trim());
  return parts;
}

function parseSeed(sql) {
  const clean = stripComments(sql);

  const insertAt = clean.search(/insert\s+into\s+commission_tiers/i);
  if (insertAt === -1) die(`no "insert into commission_tiers" in ${SEED}`);

  const columnsMatch = clean.slice(insertAt).match(/\(([^)]*)\)\s*values/i);
  if (!columnsMatch) die("could not find the column list before `values`");
  const columns = columnsMatch[1].split(",").map((c) => c.trim());

  // Read tuples by scanning from `values` to the end of the statement, so the column list's own
  // parentheses can't be mistaken for a row.
  const valuesAt = insertAt + columnsMatch.index + columnsMatch[0].length;
  const tail = clean.slice(valuesAt);
  const endAt = tail.search(/\bon\s+conflict\b|;/i);
  const rowsRegion = endAt === -1 ? tail : tail.slice(0, endAt);

  const rows = [];
  let depth = 0;
  let current = "";
  let inString = false;
  for (const ch of rowsRegion) {
    if (inString) {
      current += ch;
      if (ch === "'") inString = false;
      continue;
    }
    if (ch === "'") inString = true;
    if (ch === "(") {
      depth++;
      if (depth === 1) {
        current = "";
        continue;
      }
    }
    if (ch === ")") {
      depth--;
      if (depth === 0) {
        rows.push(current);
        current = "";
        continue;
      }
    }
    if (depth > 0) current += ch;
  }
  if (rows.length === 0) die("parsed no tier rows — has the seed's shape changed?");

  // Mapped by column NAME, never position: reordering the seed's columns must not silently
  // reassign a rate to a boundary.
  return rows.map((row) => {
    const values = splitTuple(row);
    if (values.length !== columns.length) {
      die(`row has ${values.length} values but ${columns.length} columns: (${row.trim()})`);
    }
    return Object.fromEntries(columns.map((column, i) => [column, values[i]]));
  });
}

const asInt = (raw, field) => {
  const n = Number(raw);
  if (!Number.isInteger(n)) die(`${field} is not an integer: ${raw}`);
  return n;
};

const seedRows = parseSeed(readFileSync(SEED, "utf8"));

const active = seedRows.filter((row) => /^true$/i.test(String(row.active).trim()));
if (active.length === 0) die("no active tiers in the seed");

// One effective_from, or we'd be guessing which set the website should quote. A scheduled
// repricing is a real thing the schema supports (docs/business/changing-rates.md) — when one
// lands, this failure is the prompt to decide deliberately rather than have the build pick.
const effectiveDates = [...new Set(active.map((row) => row.effective_from.trim()))];
if (effectiveDates.length > 1) {
  die(
    `the seed holds ${effectiveDates.length} active effective_from dates (${effectiveDates.join(", ")}). ` +
      "Decide which set the marketing copy should quote and teach this script the rule.",
  );
}

const tiers = active
  .map((row) => ({
    tierOrder: asInt(row.tier_order, "tier_order"),
    lowerBoundCents: asInt(row.lower_bound_cents, "lower_bound_cents"),
    upperBoundCents: /^null$/i.test(row.upper_bound_cents.trim())
      ? null
      : asInt(row.upper_bound_cents, "upper_bound_cents"),
    rateBps: asInt(row.rate_bps, "rate_bps"),
  }))
  .sort((a, b) => a.tierOrder - b.tierOrder);

const body = tiers
  .map(
    (t) =>
      `  { tierOrder: ${t.tierOrder}, lowerBoundCents: ${t.lowerBoundCents}, upperBoundCents: ${t.upperBoundCents}, rateBps: ${t.rateBps} },`,
  )
  .join("\n");

const generated = `// GENERATED FILE — DO NOT EDIT.
//
// Written by scripts/generate-published-tiers.mjs from supabase/seed/commission_tiers.sql,
// which is the single home for RIDO's rates. Editing this file by hand makes the website
// disagree with the database; CI runs the generator with --check and fails if they differ.
//
// To change a rate: edit the seed, run \`npm run generate:tiers\`, commit both.
// Full procedure: docs/business/changing-rates.md
//
// Effective from ${effectiveDates[0].replace(/'/g, "")}.

import type { CommissionTier } from "@rido/pricing";

/** The active bands, exactly as seeded. Ordered by tier_order. */
export const PUBLISHED_TIERS: readonly CommissionTier[] = [
${body}
];
`;

if (CHECK_ONLY) {
  let existing = "";
  try {
    existing = readFileSync(OUT, "utf8");
  } catch {
    die(`${OUT} does not exist. Run \`npm run generate:tiers\`.`);
  }
  if (existing !== generated) {
    die(
      "published-tiers.generated.ts is stale — the seed changed and the marketing copy would " +
        "still quote the old rates. Run `npm run generate:tiers` and commit the result.",
    );
  }
  console.log("✓ published tiers match the seed");
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, generated);
console.log(
  `✓ wrote ${tiers.length} tiers to apps/web/src/lib/marketing/published-tiers.generated.ts`,
);
