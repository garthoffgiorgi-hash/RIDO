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
 *   7. No vendor SDK is imported outside apps/web/src/lib/ (ADR-0006).
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
const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist", "out", ".vercel", "proposals"]);

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
  // Generated from supabase/seed/commission_tiers.sql by scripts/generate-published-tiers.mjs,
  // and checked against it in CI (`--check`). The rates are here because a script COPIED them
  // from the one home, not because anyone typed them twice — which is the thing this rule is
  // actually trying to prevent. Narrow on purpose: this exact path, not the directory.
  /^(apps\/web\/src\/lib\/marketing|tools\/pilot-model\/src)\/published-tiers\.generated\.ts$/,
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

// ---------------------------------------------------------------------- 7
// ADR-0006: a third-party SDK is called from apps/web/src/lib/<domain>/ and nowhere else, so
// each vendor's rules have one home and one diff. That ADR closes with "enforcement is by review
// and by this ADR, not by a tool — worth adding when the second module lands." src/lib/maps/ is
// the second module; this is that tool.
//
// Deliberately a name check on the import specifier, not a resolver: the failure it catches is
// someone reaching for `mapbox-gl` inside a component, which is visible in the import line.
const VENDOR_SDKS = [/^mapbox-gl$/, /^@mapbox\//, /^@supabase\//, /^stripe$/, /^@stripe\//];
const VENDOR_IMPORT =
  /(?:^|\n)\s*(?:import|export)[\s\S]{0,200}?from\s*["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/g;
// src/proxy.ts is wiring, not a consumer — the same category as src/lib/supabase/, which is
// exactly what it would be a part of if Next.js let it live anywhere else. The framework requires
// this one file at this one path, and its whole job is the request/response cookie plumbing that
// makes a Supabase client work in middleware. Narrow on purpose: this exact path, not a directory.
const VENDOR_ALLOWED = [/^apps\/web\/src\/proxy\.ts$/];
const webSource = files.filter(
  (f) => /^apps\/web\/src\//.test(rel(f)) && /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"),
);
for (const file of webSource) {
  const r = rel(file);
  if (r.startsWith("apps/web/src/lib/")) continue;
  if (VENDOR_ALLOWED.some((p) => p.test(r))) continue;
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(VENDOR_IMPORT)) {
    const specifier = m[1] ?? m[2];
    if (!specifier) continue;
    if (VENDOR_SDKS.some((p) => p.test(specifier))) {
      fail(
        r,
        `imports the vendor SDK "${specifier}" directly — wrap it in apps/web/src/lib/<domain>/ and call that instead (ADR-0006)`,
      );
    }
  }
}

// ---------------------------------------------------------------------- 8
// `path:line` citations rot silently. Rule 3 checks that a path resolves, and a line number keeps
// "resolving" long after the line it named moved — the reference still points somewhere, just at
// the wrong thing. Found during a drift pass: two of twelve had already rotted, and both pointed
// into a CLAUDE.md, which is the worst possible target. Every CLAUDE.md carries a hard line budget
// (rule 1), so trimming one to fit reflows every number below the edit.
//
// So: a line citation must resolve, must not point past the end of the file, and must not name a
// line in a CLAUDE.md at all. Cite the section or the table row there instead — findable by name,
// and it survives the next trim.
const LINE_REF = /`([\w./-]+\.(?:md|ts|tsx|js|jsx|mjs|sql|json|html|toml|css)):(\d+)(?:-(\d+))?`/g;

/** basename → every file carrying it, for bare `core.ts:70-72`-style citations. */
const byBasename = new Map();
for (const f of files) {
  const list = byBasename.get(basename(f));
  if (list) list.push(f);
  else byBasename.set(basename(f), [f]);
}

const citingFiles = files.filter(
  (f) => /\.(md|ts|tsx|js|jsx|mjs|sql)$/.test(f) && !isVendoredBundleContent(f),
);
for (const file of citingFiles) {
  const body = stripFences(readFileSync(file, "utf8"));
  for (const [, target, from, to] of body.matchAll(LINE_REF)) {
    const cited = `${target}:${from}${to ? `-${to}` : ""}`;
    const matches = target.includes("/")
      ? [resolve(dirname(file), target), resolve(ROOT, target)].filter(existsSync)
      : (byBasename.get(target) ?? []);

    if (matches.length === 0) {
      fail(rel(file), `line reference "${cited}" does not resolve`);
      continue;
    }
    if (basename(matches[0]) === "CLAUDE.md") {
      fail(
        rel(file),
        `"${cited}" cites a line in a CLAUDE.md — those carry a line budget and reflow on every trim. Name the section or table row instead.`,
      );
      continue;
    }
    // An ambiguous basename can't be line-checked without guessing which file was meant.
    if (matches.length > 1) continue;

    const lineCount = readFileSync(matches[0], "utf8").split("\n").length;
    if (Number(to ?? from) > lineCount) {
      fail(rel(file), `"${cited}" points past the end of a ${lineCount}-line file`);
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
