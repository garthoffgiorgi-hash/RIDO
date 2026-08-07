# RIDO — Design System

> The fair way to move. A driver-favorable rideshare marketplace launching in San Diego / UCSD.
> This folder is the source of truth for every RIDO interface and asset. Link `styles.css` and build on the tokens and components below.

RIDO's wedge is **driver economics**: it takes far less than Uber/Lyft (whose effective take runs ~35–50%), so **drivers keep more and riders pay a fairer price at the same time.** Pre-launch, capital-constrained, beachhead at UC San Diego.

**Message hierarchy (most important rule):** lead with the *tangible* (cheaper, safe, sleek); *fairness* right behind; the *movement* (anti-monopoly) is the resonant soul, surfaced for those who lean in — **never the hero.**

---

## Sources

This system was built from the RIDO project materials. If you have access, explore them for deeper context:

- **GitHub:** `https://github.com/garthoffgiorgi-hash/RIDO` — `brand/` (brand guide, design system, the three visual boards), `docs/` (business overview, monetization model, market viability, regulatory, technical architecture), `models/rido-pilot-model.jsx` (interactive pilot economics). *Note: the repo's `src/` app does not exist yet — it is pre-launch. The brand boards and docs are the real source of truth; explore the repo to design more accurately against the product.*
- **Uploaded boards:** `uploads/rido-brand-board.html`, `rido-logo-variants.html`, `rido-design-system-board.html`, `rido-brand-guide.md`, `DESIGN.md`.

---

## Content fundamentals (how RIDO writes)

**Tone:** efficient, kind, trustworthy, grounded. Confident, never corporate.

**The voice rule that resolves "irreverent + trustworthy":**
- **Irreverence points *outward*** — at the incumbents. Punchy, a little cheeky, anti-monopoly. *Marketing only.* e.g. "The other apps quietly take up to half. We built the opposite."
- **Warmth and steadiness point *inward*** — at the rider and driver. Calm, clear, reassuring. People are getting into cars with strangers at night; the voice toward them is solid, never a smartass. e.g. "Your rido is 4 min away. Driver keeps 87%."

**Mechanics:**
- **Sentence case** everywhere. Plain verbs. Active voice. No filler.
- **Specific beats clever:** "Driver keeps 87%," not "optimized payout." Say what a thing *does*, not how it's built.
- **Buttons name exactly what happens** and stay consistent through a flow: "Get a rido," "Accept," "Cancel," "Confirm pickup" — never "Submit."
- **Numbers are concrete and tabular:** "$8.40 · 4 min · 2.1 mi · 87%."
- **Errors** say what happened and how to fix it — no "Oops!", no apology, no blame. **Empty states** give direction, not mood copy.
- **Never moralize at the rider** ("do the ethical thing"). Show the better deal; let them feel good choosing it.
- **No emoji.** The blue i/I accent is the brand's only flourish.

**The verb convention:** wherever product copy uses the word as a verb, render `r` + `i`(Signal) + `do` — "get a rido," "your rido," "rate your rido." A tiny recurring Signal spark, kept consistent so it reads as systematic.

**Taglines:** spoken hook **"Get a rido."** · descriptors *The fair way to move.* / *Cheaper for you, fair for your driver.* / *Rideshare that pays drivers right.*

---

## Visual foundations

**The signature aesthetic — card-on-ivory.** White cards (`--white`) on the ivory canvas (`--ivory`), separated by a quiet tonal lift + a **1px Mist border**. This contrast does the sleek-but-warm work; preserve it everywhere. Light UI only — RIDO does **not** invert to a dark theme.

**Color.** A fixed, disciplined palette: two blues + ivory/white/mist + ink/slate. **Midnight `#0B2A5B`** is the brand (headers, primary buttons, map markers, the uppercase wordmark). **Signal `#2A5BFF`** is the *single* accent — interactive/live states, links, focus, the i/I — used sparingly so it earns attention. Semantic success (muted green) and danger (warm red) are **status only, never decoration.** Do not add colors beyond the set; an optional warm gold `#E8A33D` exists for illustration accents only.

**Type.** **Sora** (geometric, confident) for display, the wordmark, and big numbers — used with restraint. **Plus Jakarta Sans** (clean, legible small) is the workhorse for every label, button, and paragraph. **Tabular numerals (`font-feature-settings: "tnum" 1`) on every fare, ETA, distance, count, and percentage** — non-negotiable for a money app. Display sets tight (letter-spacing −0.03em); the wordmark tighter (−0.04em).

**Spacing & shape.** 8px rhythm with a 4px half-step (4 · 8 · 12 · 16 · 20 · 24 · 32 · 40). **Generous, rounded corners** are core: inputs/buttons 12px, cards 16–18px, sheets 18px (top), pills 999px. Lots of whitespace; large tap targets (≥44px).

**Borders, elevation, shadows.** Default to the **1px Mist border + tonal lift**, not shadows. Flat over glossy. A soft, minimal shadow is allowed only for a genuinely floating surface (an active bottom sheet, a hovering card) — never as decoration. No rounded corners on single-sided borders.

**Backgrounds.** Solid ivory canvas. **No gradients** as decoration, no textures, no full-bleed photography in the core UI. The map is a *light* style — **Midnight markers (not red pins)**, Midnight route line, a Signal live-driver dot. Imagery, where used, stays clean and uncluttered; the brand is typographic and color-disciplined, not illustration-heavy.

**Motion.** Subtle, purposeful, never decorative — `transition: 150–200ms ease`. The **splash beat**: lowercase `rido` appears, the Signal i-dot pings outward like a locate signal (`scale(1)→scale(2.6)`, `opacity .7→0`, ~600ms ease-out), then resolves into the uppercase `RIDO` — voice becoming monument. Bottom sheets slide with `cubic-bezier(0.32, 0.72, 0, 1)`, 320ms. **Reduced motion respected** — all animation off except instant state transitions.

**Interaction states.** Hover: subtle darken/tint, no big shifts. **Press: `transform: scale(0.98)`** on buttons. **Focus: a 3px Signal ring** (`--signal-22`) — always visible for keyboard users. **Disabled: 40% opacity, no color shift.**

**Cards** are the signature surface: white fill, 1px Mist border, radius 16–18, padding 16–20, no shadow by default.

---

## Iconography

RIDO had **no icon system of its own** (the app is pre-launch — there is no component code in the repo). For UI kits and product work this system uses **[Lucide](https://lucide.dev)** (loaded from CDN — `https://unpkg.com/lucide`): clean, modern, **2px stroke** outline icons whose geometric, confident feel matches Sora and the sleek-but-warm direction. **This is a documented substitution** — if RIDO adopts a different icon set later, swap the CDN link and keep the stroke weight consistent.

Rules:
- **Stroke (outline), 2px, currentColor.** Icons inherit text color — Ink/Slate in chrome, Signal for live/interactive moments, white on Midnight.
- Used functionally (menu, search, map-pin, star, phone, timer, trending-up…), never decoratively.
- **The logo is never an icon** — no wheel, pin, speed lines, speedometer, or car silhouette in the mark. Functional map pins *in the UI* are fine (and are Midnight, not red).
- **No emoji.** **No hand-drawn SVG icons** — use the Lucide set.

---

## Index / manifest

**Foundations (root):**
- `styles.css` — the single entry point consumers link. `@import` list only.
- `tokens/` — `fonts.css` (Sora + Plus Jakarta Sans via Google Fonts), `colors.css`, `typography.css`, `spacing.css` (spacing + radius + elevation + motion), `base.css` (resets + helpers).

**Components** (`components/`) — React primitives, built on the tokens. Each has `.jsx` + `.d.ts` + `.prompt.md`; mount via `window.RIDODesignSystem_96eb19`.
- `core/` — **Button** (primary / accent / secondary / ghost), **Card** (the signature surface), **Input** (Signal focus ring), **Avatar** (initials, Signal tint), **Badge** (status pill).
- `rideshare/` — **FareChip** (the ETA/fare pill), **StatusToggle** (driver online/offline), **TierProgress** (MTD commission bands — the wedge, made visible).

**UI kits** (`ui_kits/`) — full-screen, interactive product recreations:
- `rider-app/` — map-first request flow: where-to → fare → searching → matched → trip → rate.
- `driver-app/` — online toggle, incoming "you keep $X (Y%)" ride card, MTD tier earnings.
- `marketing/` — the landing page: tangible-first hero, how-it-works, driver economics, the mission below the fold.

**Guidelines** (`guidelines/`) — foundation specimen cards (Colors, Type, Spacing, Brand) shown in the Design System tab.

**Skill:** `SKILL.md` — makes this folder usable as a downloadable Agent Skill.

---

## The commission model (so generated product UI is accurate)

Graduated, **bracketed (marginal)** commission by monthly fare volume — like tax brackets, each band's rate applies only to fares within it:

| Band (monthly fares per driver) | Rate |
|---|---|
| $0 – $1,000 | 20% |
| $1,000 – $3,000 | 12% |
| above $3,000 | 8% |

Steady state adds a **$50/mo flat fee**, but the **6-month launch pilot waives it** (commission still runs). Worked example at $3,600 GMV: $488 total take (~13.6% blended) — driver keeps $3,112 vs ~$2,520 under a 30% incumbent. **Currency is always integer cents; numerals are always tabular.** The `TierProgress` component visualizes this; the driver ride card always shows **"You keep $X.XX (Y%)."**
