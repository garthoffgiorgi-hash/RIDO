# RIDO — DESIGN.md

> Upload this file during Claude Design org onboarding (Organization settings → Design systems → Onboarding → Add assets). It defines the complete RIDO visual language so every project inherits it automatically.

---

## 1. Brand context

RIDO is a driver-favorable rideshare marketplace. The entire wedge is driver economics — RIDO takes far less than Uber/Lyft, so drivers keep more and riders pay a fairer price. The brand is anti-incumbent without being aggressive: irreverence points outward at corporate greed, warmth and steadiness point inward at riders and drivers.

**Tone:** efficient, trustworthy, warm, grounded. Confident without corporate polish.
**Voice rule:** tangible benefits lead (cheaper, safe, sleek); fairness follows; the mission is the resonant soul, not the headline.
**Spoken hook:** "Get a rido." — the name is a verb between friends.
**Aesthetic:** sleek like the best rideshare apps, but a distinct RIDO layout. Not a clone of Uber or Lyft.

---

## 2. Color tokens

| Token | Hex | Role |
|---|---|---|
| `--midnight` | `#0B2A5B` | Primary brand. Headers, primary buttons, map markers, large wordmark. |
| `--signal` | `#2A5BFF` | The single accent. Interactive states, links, the i/I accent in the logo, focus rings. Use sparingly — it earns attention. |
| `--ivory` | `#F7F5EF` | App canvas / page background. |
| `--white` | `#FFFFFF` | Cards, sheets, surfaces that lift off ivory. |
| `--mist` | `#E7E3DA` | Dividers, hairlines, 1px borders. |
| `--ink` | `#14171F` | Primary text. |
| `--slate` | `#5B5F69` | Secondary / muted text, labels, captions. |

**Semantic (derive, keep muted):**
- Success: desaturated green — status only, never decoration.
- Danger: warm red — status only, never decoration.

**The signature rule:** white cards (`--white`) on ivory canvas (`--ivory`), separated by a quiet tonal lift + 1px `--mist` border. This contrast is doing the sleek-but-warm work — preserve it everywhere.

**Do not add colors beyond this set.** Optional warm gold `#E8A33D` for illustration accents only if the palette ever feels cold — hold the line otherwise.

---

## 3. Typography

**Display / wordmark:** Sora — geometric, confident, modern. Headlines, the wordmark, big numbers. Used with restraint.
**Body / UI:** Plus Jakarta Sans — clean, highly legible at small sizes. Every label, button, paragraph, caption.
**Numerals:** tabular figures (`font-feature-settings: "tnum" 1`) on every fare, ETA, distance, count, and percentage. Non-negotiable for a money app.

### Type scale

| Role | Size | Weight | Line-height | Face |
|---|---|---|---|---|
| Display XL (hero) | 72px | 800 | 1.0 | Sora |
| Display | 36px | 700 | 1.1 | Sora |
| Title | 22px | 700 | 1.2 | Sora |
| Heading | 18px | 600 | 1.3 | Plus Jakarta Sans |
| Body | 15–16px | 400 | 1.55 | Plus Jakarta Sans |
| Label / UI | 13px | 500 | 1.4 | Plus Jakarta Sans |
| Caption / eyebrow | 11px | 600, 0.14em tracking, UPPERCASE | 1 | Plus Jakarta Sans |
| Fare / ETA numeral | 24px | 700 | 1 | Sora, tabular |

---

## 4. Spacing & shape

**Scale (px):** 4, 8, 12, 16, 20, 24, 32, 40.

**Corner radius:**
- Inputs, buttons: `12px`
- Cards: `16–18px`
- Bottom sheets, modals: `18px` top corners
- Pills / chips: `20px+`
- Generous and rounded throughout — it is core to the sleek-but-warm feel.

**Borders:** `1px solid --mist`. No shadows by default — prefer the tonal lift of white-on-ivory. Soft minimal shadow only for elevated sheets.

---

## 5. Components

### Buttons
- **Primary:** `--midnight` fill, white text, `font-weight: 700`, radius 12, height 52px. ("Get a rido", "Accept")
- **Accent / live:** `--signal` fill, white text. For in-the-moment confirmations (confirm pickup, go online).
- **Secondary:** white fill, `--mist` border, `--ink` text.
- **Ghost:** transparent, `--slate` text.
- Active state: `transform: scale(0.98)`. Disabled: 40% opacity, no color shift.
- All buttons: sentence case, plain verb, states the action exactly.

### Cards
White fill, 1px `--mist` border, radius 16–18px, padding 16–20px. The default surface for rides, drivers, fares, any content unit. This is the signature component — use it consistently.

### Inputs
White fill, 1px `--mist` border, radius 12px, height 52px. Focus: `--signal` 3px ring. Labels in `--slate`, sentence case. Error states say what went wrong and how to fix it — no apologies, no vague messages.

### Fare / ETA chip
Pill (radius 20px+), `--signal` at 8% alpha background, `--signal` text, Sora tabular numerals. Used for ETAs, distances, live states. ("4 min away", "2.1 mi")

### Navigation / top bar
In-app wordmark is lowercase `rido` (blue i) — the voice register. Minimal chrome. White or ivory background.

### Bottom sheet
Primary ride-flow surface. White fill, radius 18px on top corners, slides up over the dimmed map. Primary CTA pinned to bottom. Tabular fare prominent.

### Map
Light style. **Midnight (`#0B2A5B`) markers — not red pins.** Route line in Midnight. Live driver dot in Signal blue. Brand-colored, never default.

### Driver status toggle
Online/offline: clear pill switch. Online state = `--signal` track. Offline = `--mist`. Label in `--midnight`.

### Avatar / initials
Circle, `--signal` at 12% alpha background, `--midnight` text, Plus Jakarta Sans 600.

### Driver ride card
Shows: rider name + destination, distance, ETA — and prominently: **"You keep $X.XX (Y%)"** in large tabular Sora. This is the wedge made visible on every accepted ride. The percentage is always shown.

### MTD tier progress
Month-to-date earnings bar showing progress through the three commission bands ($0–1k at 20%, $1k–3k at 12%, $3k+ at 8%). Fills as the driver earns — turns the commission model into a visible motivator rather than an opaque deduction.

---

## 6. Motion

- **Default:** subtle, purposeful, never decorative. `transition: 150–200ms ease`.
- **Splash beat:** lowercase `rido` appears → the Signal-blue i-dot pulses outward (locate-signal ping, `scale(1) → scale(2.6), opacity(0.7) → opacity(0)`, ~600ms ease-out) → resolves into uppercase `RIDO` icon. Voice becoming monument. One ring, one pulse.
- **Bottom sheet:** slides up with `cubic-bezier(0.32, 0.72, 0, 1)`, 320ms.
- **Reduced motion:** all animations off except instant state transitions. Respect `prefers-reduced-motion`.

---

## 7. Copy / voice (so generated microcopy stays on-brand)

- Plain verbs, sentence case, active voice. Button labels state exactly what happens.
- Specific over clever: "Driver keeps 87%" not "optimized payout."
- Irreverence at incumbents (in marketing): "The other apps take up to half. We don't."
- Warmth at rider/driver (in product): calm, clear, reassuring — people are getting in cars at night.
- Errors say what happened and how to fix it. No "Oops!" No blame.
- Empty states give direction, not mood copy.
- Never moralize at the rider. Show the better deal; let them feel good choosing it.

---

## 8. Logo system

Two cases, two jobs, one constant accent.

**RIDO** (uppercase, Signal-blue **I**) — the **monument.** App icon, splash screen, favicon, large standalone marks. Authority + recognition.

**rido** (lowercase, Signal-blue **i**) — the **voice.** In-app wordmark (top bar), the verb in product copy, marketing moments. Warm, conversational, peer-to-peer.

**The accent is the through-line.** The Signal-blue i/I is constant in both cases — the single element that's unmistakably RIDO whether the mark is shouting or speaking.

**Avoid:** wheel, location pin, speed lines, speedometer, road, car silhouette. The wordmark + the blue accent carry the identity. Never use a face other than Sora.

**Application:**
- App icon → `RIDO` uppercase, blue I, Midnight on white or ivory.
- In-app top bar → `rido` lowercase, blue i.
- Marketing hero → either case depending on context; lowercase for "Get a rido" moments, uppercase for brand statements.
- The verb in UI copy → lowercase `rido` with blue i consistently ("your rido is 4 min away").

---

## 9. Screen blueprints

### Landing page (marketing)
Hero: monument `RIDO` mark + a tangible-first headline ("Cheaper. Fairer. Your rido is 4 min away."). NOT "fight corporate greed" — mission is the soul, not the hero. Sub-headline: driver take-home vs incumbent in concrete numbers. CTA: "Get a rido" (primary, Midnight). Below the fold: how it works (rider + driver perspectives), the driver economics comparison (show the $1,240/mo advantage), mission section for those who lean in. Card-on-ivory aesthetic throughout. Full-width sections with generous whitespace. No clutter.

### Rider request flow
- Map-first, Midnight markers, light map style.
- Bottom sheet: "Where to?" input (prominent, radius 12).
- Fare + ETA shown up front before confirmation — honest pricing is the brand.
- Lowercase `rido` in top bar.
- CTA: "Get a rido" (Midnight, full-width).
- States: searching → matched (driver card with name, rating, ETA) → en route → arrived → in trip → rate your rido.

### Driver view
- Online/offline toggle prominent at top (Signal when online).
- Incoming ride card: rider name + pickup + destination, distance, **"You keep $X.XX (Y%)"** large and prominent in Sora tabular.
- Accept (Midnight) / Decline (Ghost) buttons.
- MTD earnings section: total this month, tier progress bar (three bands), next-tier projection.
- All financial figures in tabular Sora.
