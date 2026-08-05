# docs — CLAUDE.md

## The rule

**A decision is not real until it is a committed file here.** Chat threads, the Obsidian vault,
and Claude Design conversations are where thinking *happens*; `docs/` is where it *lands*. The
flow is one-way: vault → repo. Nothing outside this repo is authoritative. (ADR-0004)

## One fact, one home

`README.md` maps every class of fact to the single file that governs it. Before writing a number,
a rate, a threshold, or a rule into any doc, **check that map**. If the fact already has a home,
**link to it — do not restate it.** Restating is how a repo drifts: two copies agree on the day
they're written and disagree forever after.

The corollary: a doc that describes *what currently exists in the repo* is a maintenance
liability. Either keep it dated and current (`roadmap.md`) or don't write it. The old
`CLAUDE.md` confidently described `index.html`, `styles.css`, and a CI workflow that had never
existed in this repository — that is the failure mode this rule exists to prevent.

## ADRs (`decisions/`)

Numbered, dated, short. One decision per file. Format: **Context → Decision → Consequences →
Status**.

- **Never edit a decided ADR to change the decision.** Write a new ADR and mark the old one
  `Superseded by ADR-NNNN`. The history is the point.
- **Every invariant in the root `CLAUDE.md` cites an ADR.** Changing an invariant without an ADR
  creates exactly the silent drift this structure exists to prevent.
- Numbers are permanent. Never renumber, never reuse.
- An ADR is allowed to be three paragraphs. Most should be.

## Writing for an agent, not a browser

- **One topic per file, target under 200 lines.** Split when a file grows a second concern.
- **Lead with the conclusion.** These files are loaded under a context budget by something that
  will read the first 30 lines and act. Bury the verdict and it won't be found.
- Mark estimates as estimates and cite real figures where they came from the web.
  `business/market-viability.md` is the model for this.
- Cross-reference with backticked relative paths. A bare `@path` in a CLAUDE.md is an eager
  import that loads the whole file into every session — that is almost never what you want.

## Where the vault fits

The Obsidian vault holds work-in-progress thinking: ~44 notes of exploration, meeting notes, raw
research. That's the right place for it. The discipline is that **a vault note must never state a
rule** — it links to the `docs/` path that governs, or it promotes itself into an ADR. If you
find yourself checking the vault to answer "what's our commission rate", the split has already
broken.
