# brand — CLAUDE.md

## What governs what

| File | Authority |
|---|---|
| `design-system.md` | **Canonical.** Tokens, type scale, spacing, components, motion, logo system. The only file that *defines* a value. |
| `brand-guide.md` | Positioning, voice, message hierarchy. Governs **copy**, not pixels. |
| `boards/*.html` | Hand-written reference boards. Illustrative only — if a board and `design-system.md` disagree, **the doc wins.** |
| `exports/*.dc.html` | Claude Design exports. **Reference artifacts, not source.** |

**If a value appears in two places, delete one.** This has already bitten us: a duplicate
`DESIGN.md` specified 52px inputs while `design-system.md` specified 44px, and nothing caught it
because both files read as authoritative.

## Claude Design exports (`exports/`)

- **Never read a `.dc.html` in full.** They are self-extracting bundles — a 170KB export is ~95%
  base64 woff2 fonts wrapped around ~30KB of actual markup. Reading one burns context for nothing
  and teaches you the bundler, not the design.
- Every export has a sibling `<same-name>.md` **handoff note**: what surface it is, what changed,
  what to build, what to ignore. **Read the note.** If a note is missing, write one before using
  the export.
- **Never copy CSS or markup out of an export into `apps/web`.** Rebuild it with Tailwind tokens
  and the primitives in `src/components/ui/`. The export is a picture of the destination, not the
  road to it — transcribing it imports hardcoded hexes, absolute pixel values, and inlined fonts
  straight past every rule in this repo.
- If an export contradicts `design-system.md`, that is **a decision to make, not a value to
  copy.** Update the design system first, then build.
- Naming: `YYYY-MM-DD-<surface>-v<n>.dc.html`. Keep old versions — they're cheap and they're the
  only record of what a surface used to look like.
- `.gitattributes` marks them `-diff merge=binary`. Don't fight that; don't hand-merge one.

## Voice — applies to every string you write

Plain verbs, sentence case, active voice. Buttons name exactly what happens ("Get a rido", not
"Submit"). Specific beats clever: "Drivers keep 87%", not "optimized payouts".

**Irreverence points outward** — at incumbents, in marketing. **Warmth and steadiness point
inward** — at riders and drivers, in product. People are getting into cars with strangers at
night; the voice toward them is solid and reassuring, never a smartass.

Errors say what happened and how to fix it. No apologies, no "Oops!". Empty states give
direction, not mood. **Never moralize at the rider** — show the better deal and let them feel
good choosing it.

Message hierarchy, in order: tangible (cheaper, safe, sleek) → fair (drivers keep more) →
the movement (surfaced for those who lean in, **never the hero**).
