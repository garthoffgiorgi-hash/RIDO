# ADR-0004 — The repo is canonical; the vault is upstream thinking

**Status:** Accepted
**Date:** 2026-08-05

## Context

RIDO's context lives in three places: this repo (`docs/`, `brand/`), a ~44-note Obsidian vault,
and Claude Design `.dc.html` exports. Three homes, no stated precedence — so a fact can be true
in one and stale in the other two, silently.

This is not hypothetical. At the time of this ADR the root `CLAUDE.md` — the file loaded into
every Claude Code session — described `index.html`, `about.html`, `styles.css`, `script.js`,
`vercel.json`, and a CI workflow. **None of those files has ever existed in this repository**
(`git log --all --name-only` confirms it). The always-loaded context file was confidently
describing a different codebase, and every session inherited that.

Three options were considered:

| Option | Why not |
|---|---|
| **(b) Vault canonical, repo generated** | Requires a generation pipeline nobody will build and that bit-rots in week two. And Claude Code cannot read the vault — the agent that does the work would be reading a derived copy. |
| **(c) Split by audience** (strategy in vault, technical in repo) | Fails on shared facts. "Commission is 20/12/8 bracketed" is needed by both audiences, so it gets written twice, and two copies drift. This is exactly how `brand/DESIGN.md` came to specify 52px inputs while `brand/design-system.md` specified 44px. |
| **(a) Repo canonical** | Chosen. |

## Decision

**The repo is canonical. The vault is upstream, one-way.**

- A decision is not real until it is a committed file in `docs/`, and a rule change is not real
  until it is an ADR.
- The split is by **lifecycle, not audience**: the vault is where thinking happens (messy,
  exploratory, 44 notes and growing); `docs/` is where decisions land (few, canonical, dated).
- **A vault note must never state a rule.** It links to the `docs/` path that governs, or it
  gets promoted into an ADR. If you check the vault to answer "what's our commission rate," the
  split has already broken.
- Claude Design exports are **reference artifacts, never sources of truth** — see `brand/CLAUDE.md`.

## Consequences

- Git gives every decision review, diff, blame, and PR-gating. The vault has none of those, which
  is why it can't hold rules.
- The vault stays useful and stays messy. Nothing has to be migrated out of it — only demoted.
- Enforced mechanically by `scripts/check-context.mjs`: broken cross-references, oversized context
  files, and pricing constants outside their one home fail the check.
- Cost: writing something down now has two steps (think in the vault, land it in `docs/`). That
  friction is the feature — it's what makes "decided" mean something.

## [DECISION NEEDED — yours]

Whether to keep the vault at all. The alternative is a gitignored `docs/notes/` directory: same
one-way flow, one less tool, and drafts sit next to the decisions they'll become. Obsidian's
backlinks and graph are real advantages for 44+ notes of exploration, so this ADR assumes the
vault stays. If you'd rather collapse to one tool, say so and a superseding ADR replaces this one.
