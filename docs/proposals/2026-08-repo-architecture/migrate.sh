#!/usr/bin/env bash
#
# RIDO — repo architecture migration.
#
# Run from the repository root:   bash docs/proposals/2026-08-repo-architecture/migrate.sh
#
# Every move is a `git mv`, so history follows the files. Nothing is deleted except the
# proposal bundle itself and one duplicate file whose unique content you merge first (step 7).
# Re-runnable safety: it refuses to start on a dirty tree, and stops at the first error.

set -euo pipefail

BUNDLE="docs/proposals/2026-08-repo-architecture/files"

# ---------------------------------------------------------------- preflight
[ -d .git ] || { echo "error: run this from the repository root"; exit 1; }
[ -d "$BUNDLE" ] || { echo "error: $BUNDLE not found"; exit 1; }
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "error: working tree has uncommitted changes — commit or stash first"; exit 1
fi

echo "==> 1/9  docs/ — split by concern"
mkdir -p docs/business docs/architecture docs/compliance docs/decisions
git mv docs/business-overview.md       docs/business/overview.md
git mv docs/market-viability.md        docs/business/market-viability.md
git mv docs/monetization-model.md      docs/business/monetization.md
git mv docs/regulatory-compliance.md   docs/compliance/ca-tnc.md
git mv docs/technical-architecture.md  docs/architecture/data-model.md
git mv docs/reconciliation.md          docs/roadmap.md

echo "==> 2/9  brand/ — canonical docs, reference boards, Design exports"
mkdir -p brand/boards brand/exports
# Fixes the broken `@brand/brand-guide.md` reference in CLAUDE.md and README.md.
git mv brand/rido-brand-guide.md            brand/brand-guide.md
git mv brand/rido-brand-board.html          brand/boards/brand-board.html
git mv brand/rido-logo-variants.html        brand/boards/logo-variants.html
git mv brand/rido-design-system-board.html  brand/boards/design-system-board.html
git mv "RIDO Landing.html"                  brand/exports/2026-08-05-landing-v1.dc.html

echo "==> 3/9  models/ -> tools/  (\"models\" reads as data models to an agent)"
mkdir -p tools/pilot-model
git mv models/rido-pilot-model.jsx tools/pilot-model/PilotModel.jsx
rmdir models 2>/dev/null || true

echo "==> 4/9  scaffolding for code that doesn't exist yet"
mkdir -p apps/web packages/pricing/src \
         supabase/migrations supabase/seed supabase/functions supabase/tests \
         scripts .claude/rules
for d in supabase/migrations supabase/functions supabase/tests; do
  touch "$d/.gitkeep"
done

echo "==> 5/9  install context files from the proposal bundle"
cp "$BUNDLE/CLAUDE.md"                              CLAUDE.md
cp "$BUNDLE/README.md"                              README.md
cp "$BUNDLE/package.json"                           package.json
cp "$BUNDLE/.gitattributes"                         .gitattributes
cp "$BUNDLE/.claude/rules/money.md"                 .claude/rules/money.md
cp "$BUNDLE/scripts/check-context.mjs"              scripts/check-context.mjs
mkdir -p apps/web/src/lib/supabase apps/web/src/types
cp "$BUNDLE/apps/web/CLAUDE.md"                     apps/web/CLAUDE.md
cp "$BUNDLE/apps/web/src/lib/supabase/server.ts"    apps/web/src/lib/supabase/server.ts
cp "$BUNDLE/apps/web/src/types/database.types.ts"   apps/web/src/types/database.types.ts
cp "$BUNDLE/packages/pricing/CLAUDE.md"             packages/pricing/CLAUDE.md
cp "$BUNDLE/packages/pricing/package.json"          packages/pricing/package.json
cp "$BUNDLE/packages/pricing/src/"*.ts              packages/pricing/src/
cp "$BUNDLE/supabase/CLAUDE.md"                     supabase/CLAUDE.md
cp "$BUNDLE/supabase/seed/commission_tiers.sql"     supabase/seed/commission_tiers.sql
cp "$BUNDLE/docs/architecture/ride-completion.md"   docs/architecture/ride-completion.md
cp "$BUNDLE/brand/CLAUDE.md"                        brand/CLAUDE.md
cp "$BUNDLE/brand/exports/README.md"                brand/exports/README.md
cp "$BUNDLE/brand/exports/2026-08-05-landing-v1.md" brand/exports/2026-08-05-landing-v1.md
cp "$BUNDLE/docs/CLAUDE.md"                         docs/CLAUDE.md
cp "$BUNDLE/docs/README.md"                         docs/README.md
cp "$BUNDLE/docs/decisions/"*.md                    docs/decisions/

echo "==> 6/9  repoint cross-references broken by the moves"
# Every one of these was found by scripts/check-context.mjs against the migrated tree.
sed -i 's|`monetization-model\.md`|`monetization.md`|g; s|`regulatory-compliance\.md`|`../compliance/ca-tnc.md`|g' \
  docs/business/market-viability.md
sed -i 's|`monetization-model\.md`|`monetization.md`|g; s|`technical-architecture\.md`|`../architecture/data-model.md`|g' \
  docs/business/overview.md
sed -i 's|`technical-architecture\.md`|`../architecture/data-model.md`|g; s|`\.\./models/rido-pilot-model\.jsx`|`../../tools/pilot-model/PilotModel.jsx`|g' \
  docs/business/monetization.md
sed -i 's|`technical-architecture\.md`|`../architecture/data-model.md`|g' \
  docs/compliance/ca-tnc.md
sed -i 's|`\.\./monetization-model\.md`|`../business/monetization.md`|g; s|`reconciliation\.md`|`../roadmap.md`|g' \
  docs/architecture/data-model.md

echo "==> 7/9  remove the proposal bundle (its job is done)"
git rm -r --quiet --cached docs/proposals 2>/dev/null || true
rm -rf docs/proposals

echo "==> 8/9  stage everything"
git add -A

echo "==> 9/9  context check"
node scripts/check-context.mjs --warn-only || true

cat <<'NOTES'

────────────────────────────────────────────────────────────────────────────
Mechanical migration complete and staged. Two content tasks remain — they
move prose between files, so they are deliberately NOT automated:

  A. brand/DESIGN.md is a near-duplicate of brand/design-system.md and the
     two disagree (DESIGN.md: 52px inputs and buttons; design-system.md:
     44px). Resolve it:
       1. Decide the real input/button height. Write it in design-system.md.
       2. Copy DESIGN.md section "## 6. Motion" into design-system.md —
          it is the only content design-system.md lacks. (Sections 1/2/3/4/5
          duplicate design-system.md; section 7 duplicates brand-guide.md.)
       3. git rm brand/DESIGN.md
       4. Re-upload brand/design-system.md to Claude Design org onboarding
          so the tool and the repo read the same file.

  B. docs/architecture/ride-completion.md now holds the completion flow.
     Delete the now-duplicated sections from docs/architecture/data-model.md:
     everything from "## The completion flow (the critical path)" down to
     (not including) "## Other architecture notes", plus the "## DECIDED —
     bracketed per-ride" section, which ADR-0002 now owns. Leave a backticked
     link to ride-completion.md behind. data-model.md then describes tables
     only, which is what its name promises.

Everything else — including three cross-references that were already broken
before this migration — is done and staged.

Then:  node scripts/check-context.mjs        (must exit 0)
       git commit -m "refactor: restructure repo for scoped context loading"
────────────────────────────────────────────────────────────────────────────
NOTES
