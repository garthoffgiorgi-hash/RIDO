# RIDO — Context Index & Setup

How everything we've built fits together, and how to wire it into Claude Code, Claude Design, and this Project so all three draw from the same source of truth.

---

## Recommended folder structure (repo root)

```
rido/
├── CLAUDE.md                 ← Claude Code auto-loads this every run. The hub.
├── README.md                 ← this file. Human index + setup.
├── docs/                     ← strategy & decisions (context for Code + you)
│   ├── business-overview.md
│   ├── market-viability.md
│   ├── monetization-model.md
│   ├── regulatory-compliance.md
│   └── technical-architecture.md
├── brand/                    ← identity & UI system (feeds Claude Design)
│   ├── brand-guide.md
│   ├── design-system.md
│   ├── rido-brand-board.html
│   ├── rido-logo-variants.html
│   └── rido-design-system-board.html
├── models/
│   └── rido-pilot-model.jsx  ← interactive pilot economics model
└── src/ …                    ← your actual Next.js app
```

`CLAUDE.md` `@`-references the `docs/` and `brand/` files, so Claude Code can pull any of them into context on demand. That reference graph is the whole trick — one hub, everything else hangs off it.

---

## What each file is, and who uses it

| File | What it is | Primary consumer |
|---|---|---|
| `CLAUDE.md` | Operating manual: stack, domain invariants, brand rules, guardrails, references | **Claude Code** (auto-loaded) |
| `docs/business-overview.md` | What/why/who, the wedge, the market | Code + you |
| `docs/market-viability.md` | Sizing, take-rate data, driver break-even, Empower rules, the verdict | Code + you |
| `docs/monetization-model.md` | The finalized pricing + pilot logic | **Code** (pricing work) |
| `docs/regulatory-compliance.md` | CA TNC rules, insurance, Prop 22, compliance fields | Code + you + your lawyer/broker |
| `docs/technical-architecture.md` | Schema, the trigger, `completeRide`, the open retroactive decision | **Code** (backend) |
| `brand/brand-guide.md` | Positioning, voice, message hierarchy, visual direction | **Claude Design** + Code |
| `brand/design-system.md` | The concrete UI kit: tokens, components, logo system, screen blueprints | **Claude Design** + Code |
| `brand/*.html` | Visual boards (brand, logo variants, design system) | **Claude Design** + you |
| `models/rido-pilot-model.jsx` | Interactive economics model | You |

---

## Wiring it into the three tools

### 1. Claude Code
- Put `CLAUDE.md` at the **repo root**. Code loads it automatically every session; it pulls the `docs/` and `brand/` files via the `@` references when relevant.
- Connect the repo via the Claude GitHub App (read + write) so Code can open PRs. This is the connection that actually changes code.
- Before a big task, sync the repo so Code sees the latest.

### 2. Claude Design
- One-time, highest-leverage move: org settings → design systems → onboarding. Feed it **`brand/design-system.md`** + the **three `.html` boards** (and optionally the repo link). Every project then inherits the system — no re-briefing per session.
- Connecting your repo here is **read-only** — Design reads your components for context but never commits. So it doesn't override anything; the replacement only happens when Code writes PRs (reviewable, reversible — your old frontend stays in git history).
- Build the **landing page** here (visual ROI is highest), then hand off to Code.

### 3. This Project (and future chats)
- Add `CLAUDE.md`, the `docs/`, and the `brand/` files to **Project knowledge** (the GitHub connection in Projects is read-only context, or upload the files). Then every future RIDO chat in this Project inherits the full picture — no re-explaining.
- Keep this Project as the **source of truth**: Code and Design are workshops; decisions get written back here.

---

## Division of labor (keep it clean)
- **Strategy/decisions** → `docs/` (update when a decision changes).
- **Look** → Claude Design (don't go to Design for code fixes).
- **Code** → Claude Code (don't go to Code for visual exploration).
- **The spine** → `CLAUDE.md` + this Project, which everything else references.

---

## Open items flagged across these docs
1. **Commercial-TNC insurance quote** — the master variable; gates the financial model. (broker)
2. **Retroactive vs per-ride bracketed commission** — architectural; build per-ride bracketed until confirmed.
3. **Prop 22 × "drivers-set-fares" classification** — needs a real CA lawyer.
4. **Logo final** — uppercase + accent chosen for the monument; lowercase woven through the voice.
