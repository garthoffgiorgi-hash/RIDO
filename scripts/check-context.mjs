#!/usr/bin/env node
/**
 * check-context.mjs — the drift guard.
 *
 * Structure only helps if something notices when it rots. This is that something.
 * No dependencies; run with `node scripts/check-context.mjs` (add `--warn-only` in a
 * pre-commit hook if you want it advisory before the app exists).
 *
 * Checks:
 *   1. Every CLAUDE.md is under the line budget (context you pay for every session).
 *   2. No bare `@path` imports in CLAUDE.md — those inline into EVERY session at launch.
 *   3. Every backticked file reference in markdown resolves on disk.
 *   4. Every `ADR-NNNN` mention has a matching file in docs/decisions/.
 *   5. Every `.dc.html` export has a handoff note (sibling file, or one per bundle folder).
 *   6. Pricing constants appear only where they're allowed to.
 *
 * brand/exports/<bundle>/** is vendor content — a Design handoff bundle, not repo-authored.
 * It keeps its own internal cross-references (from Design's own snapshot, not this repo's
 * current paths) and isn't something we edit. Exempt from rules 1-4 and 6, same treatment as
 * not reading a .dc.html in full: reference material, not a thing to lint.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WARN_ONLY = process.argv.includes("--warn-only");
// "proposals" is a staging area for not-yet-adopted structure: its files intentionally
// reference paths that don't exist until the proposal is merged. Delete the directory once
// a proposal lands and this exclusion stops mattering.
const SKIP_DIRS = new Set([
  ".git", "node_modules", ".next", "dist", "out", ".vercel", "proposals",
]);

const CLAUDE_MD_MAX_LINES = 200;
const DOC_MAX_LINES = 250;

const problems = [];
const fail = (file, msg) => problems.push({ file, msg });

/** Recursively collect files, skipping build and VCS noise. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Blank out fenced code blocks so their contents aren't parsed as references. */
const stripFences = (s) => s.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, " "));

const files = walk(ROOT);
const rel = (f) => relative(ROOT, f);
/** brand/exports/<bundle>/** — a Design handoff bundle. Vendor content; see file header. */
const isVendoredBundleContent = (f) => /^brand\/exports\/[^/]+\//.test(rel(f));
const markdown = files.filter((f) => f.endsWith(".md") && !isVendoredBundleContent(f));

/** Every markdown basename in the repo, for resolving sibling-style `foo.md` citations. */
const knownDocNames = new Set(markdown.map((f) => basename(f)));

// ---------------------------------------------------------------- 1, 2, 3, 4
for (const file of markdown) {
  const raw = readFileSync(file, "utf8");
  const body = stripFences(raw);
  const lines = raw.split("\n").length;
  const isClaudeMd = basename(file) === "CLAUDE.md";

  // 1 — size budget
  const limit = isClaudeMd ? CLAUDE_MD_MAX_LINES : DOC_MAX_LINES;
  if (lines > limit) {
    fail(rel(file), `${lines} lines exceeds the ${limit}-line budget — split it`);
  }

  // 2 — bare @imports in CLAUDE.md eagerly inline into every session
  if (isClaudeMd) {
    const withoutSpans = body.replace(/`[^`\n]*`/g, " ");
    for (const m of withoutSpans.matchAll(/(^|\s)@([\w./~-]+\.\w+)/g)) {
      fail(
        rel(file),
        `bare @import "${m[2]}" loads into EVERY session at launch — backtick it to make it a pointer`,
      );
    }
  }

  // 3 — backticked references must resolve.
  //     Paths with a slash resolve against the file's directory or the repo root.
  //     Bare `*.md` filenames resolve against every markdown file in the repo: they're how
  //     sibling docs cite each other, and they're the first thing a rename breaks.
  for (const m of body.matchAll(/`([^`\n]+)`/g)) {
    const ref = m[1].trim();
    if (!/^[@\w./-]+\.(md|ts|tsx|js|jsx|mjs|sql|json|html|toml)$/.test(ref)) continue;
    const target = ref.replace(/^@/, "");

    if (target.includes("/")) {
      const candidates = [resolve(dirname(file), target), resolve(ROOT, target)];
      if (!candidates.some(existsSync)) fail(rel(file), `reference "${ref}" does not resolve`);
    } else if (target.endsWith(".md") && !knownDocNames.has(target)) {
      fail(rel(file), `reference "${ref}" names no file in the repo — renamed or deleted?`);
    }
  }

  // 4 — ADR references must exist
  const adrDir = join(ROOT, "docs", "decisions");
  const adrs = existsSync(adrDir) ? readdirSync(adrDir) : [];
  for (const m of body.matchAll(/ADR-(\d{4})/g)) {
    if (!adrs.some((f) => f.startsWith(m[1]))) {
      fail(rel(file), `cites ADR-${m[1]}, which has no file in docs/decisions/`);
    }
  }
}

// ---------------------------------------------------------------------- 5
for (const file of files.filter((f) => f.endsWith(".dc.html"))) {
  if (existsSync(file.replace(/\.dc\.html$/, ".md"))) continue;

  // A bundle export (brand/exports/<bundle>/*.dc.html) is handed off with ONE note per bundle,
  // not one per file: brand/exports/<bundle>.md, sibling to the bundle folder itself.
  const bundleMatch = rel(file).match(/^(brand\/exports\/[^/]+)\//);
  if (bundleMatch && existsSync(resolve(ROOT, `${bundleMatch[1]}.md`))) continue;

  fail(rel(file), "export has no handoff note — write one before using it");
}

// ---------------------------------------------------------------------- 6
// Tier boundaries and rates belong in the seed and the ADR. Anywhere else is a hardcode.
const PRICING_LITERALS = [
  [/\b100000\b|\b300000\b/, "tier boundary in cents"],
  [/\b2000\b.*bps|\bbps.*\b2000\b/i, "tier rate in bps"],
  [/\b5000\b.*(flat|fee)|\b(flat|fee)\b.*\b5000\b/i, "flat fee in cents"],
  [/0\.20\b|0\.12\b|0\.08\b/, "commission rate as a float"],
];
const PRICING_ALLOWED = [
  /^supabase\/seed\//,
  /^docs\//,
  /^packages\/pricing\/.*\.test\.ts$/,
  /^scripts\/check-context\.mjs$/,
  /^CLAUDE\.md$/,
  /^brand\/exports\//,
];
const codeFiles = files.filter((f) => /\.(ts|tsx|js|jsx|sql)$/.test(f));
for (const file of codeFiles) {
  const r = rel(file);
  if (PRICING_ALLOWED.some((p) => p.test(r))) continue;
  const src = readFileSync(file, "utf8");
  for (const [pattern, label] of PRICING_LITERALS) {
    if (pattern.test(src)) {
      fail(r, `looks like a hardcoded ${label} — read it from commission_tiers instead`);
    }
  }
}

// ------------------------------------------------------------------- report
if (problems.length === 0) {
  console.log("✓ context check passed");
  process.exit(0);
}

console.error(`\n${problems.length} context problem(s):\n`);
for (const { file, msg } of problems) console.error(`  ${file}\n    ${msg}\n`);
console.error(
  WARN_ONLY
    ? "(--warn-only: not failing the build)"
    : "Context drift is how a repo starts lying to Claude. Fix these.",
);
process.exit(WARN_ONLY ? 0 : 1);
