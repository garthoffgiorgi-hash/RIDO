# RIDO — Design System (v0)

> Feed this to Claude Design's organization-level design system (org settings → design systems → onboarding) alongside the brand boards. Once set up, every project inherits it. This is the concrete UI kit; `brand-guide.md` is the higher-level positioning/voice/why.

---

## 1. Foundations

### Color tokens
| Token | Hex | Role |
|---|---|---|
| `--midnight` | `#0B2A5B` | Primary brand. Headers, primary buttons, map markers, the uppercase wordmark, key surfaces. |
| `--signal` | `#2A5BFF` | The single accent. Interactive/live states, links, the i/I accent, focus. Use sparingly — it earns attention. |
| `--ivory` | `#F7F5EF` | App canvas / page background. |
| `--white` | `#FFFFFF` | Cards, sheets, surfaces that lift off the ivory. |
| `--mist` | `#E7E3DA` | Dividers, hairlines, borders (1px). |
| `--ink` | `#14171F` | Primary text. |
| `--slate` | `#5B5F69` | Secondary/muted text. |

Semantic (derive, keep muted): success → a desaturated green; danger → a warm red; both used only for status, never decoration. **Do not add colors beyond this set.** Optional warm gold `#E8A33D` for illustration accents only, if blue ever feels cold — hold the line otherwise.

**The card-on-ivory rule (signature aesthetic):** white cards on the ivory canvas, separated by that quiet tonal lift + a 1px Mist border. This contrast is doing real work — keep it everywhere.

### Typography
- **Display / wordmark:** **Sora** — geometric, confident, modern. Headlines, the wordmark, big numbers. Used with restraint.
- **Body / UI:** **Plus Jakarta Sans** — clean, highly legible small. Every label, button, paragraph.
- **Numerals: tabular figures, always**, on fares, ETAs, distances, counts, percentages. (`font-feature-settings: "tnum" 1`.) Non-negotiable for a money app — numbers must align.

**Type scale** (px / weight / line-height):
| Role | Size | Weight | LH |
|---|---|---|---|
| Display XL (hero) | 48–84 | 800 (Sora) | 1.0–1.1 |
| Display | 30–32 | 700 (Sora) | 1.1 |
| Title | 22 | 700 (Sora) | 1.2 |
| Heading | 18 | 600 | 1.3 |
| Body | 15–16 | 400 | 1.55 |
| Label / caption | 12–13 | 500/600 | 1.4 |
| Eyebrow | 11 | 600, `letter-spacing .14em`, UPPERCASE | 1 |
| Numeral (fare/ETA) | 22–26 | 600–700 (Sora), tabular | 1 |

### Spacing & shape
- Spacing scale (px): 4, 8, 12, 16, 20, 24, 32, 40.
- Corner radius: inputs/buttons `12px`; cards `16–18px`; pills `20px+`. **Generous and rounded** — it's core to the sleek-but-warm feel.
- Borders: `1px solid --mist`. No rounded corners on single-sided borders.
- Elevation: prefer the border + tonal lift over shadows. If a shadow is needed (active sheet), keep it soft and minimal. Flat over glossy.

---

## 2. The logo system (RIDO / rido)

Two cases, two jobs, one constant accent.

- **RIDO** — uppercase, Signal-blue **I**. The **monument**: app icon, splash, favicon, large standalone marks, anywhere the brand is the subject and needs authority + recognition.
- **rido** — lowercase, Signal-blue **i**. The **voice**: the brand as a verb, woven into language and product. The **in-app wordmark** (top bar) is lowercase `rido`. In running copy, the word "rido" used as a verb takes the blue i — a tiny recurring spark ("get a rido," "your rido," "rate your rido").
- **The accent is the through-line:** the blue i/I is constant across both cases — the one element that's unmistakably RIDO whether shouting or speaking.

**Creative applications of lowercase:**
- **Splash motion:** lowercase `rido` appears, the i-dot "pings" (a locate-signal pulse in Signal blue), then resolves into the uppercase `RIDO` icon — voice becoming monument. Use as the cold-open animation.
- **Verb in voice (marketing, sparingly):** "let's rido." / "rido there."
- **Microcopy convention:** wherever product UI says the verb, render `r`+`i`(signal)+`do`. Keep it consistent so the spark reads as systematic, not random.

**Don'ts:** no wheel, no location pin, no road/speed lines, no speedometer. The wordmark + the accent carry it. Never set the logo in a face other than Sora.

---

## 3. Components

> All built on the tokens above. Tabular numerals on anything numeric. Touch targets ≥ 44px.

- **Buttons.** *Primary* — solid `--midnight`, white text, radius 12, weight 700 ("Get a rido," "Accept"). *Accent/live* — solid `--signal`, white text (for in-the-moment actions, e.g. confirm pickup). *Secondary* — white fill, `--mist` border, `--ink` text. *Ghost* — transparent, `--slate` text. Active state: subtle scale(0.98). Disabled: reduced opacity, no color shift.
- **Cards.** White fill, `--mist` 1px border, radius 16–18, padding 16–20. The default container for everything (a ride, a driver, a fare). This is the signature surface.
- **Inputs.** White fill, `--mist` border, radius 12, 44px tall; focus → `--signal` ring. Labels in Slate, sentence case. Errors state what's wrong and how to fix it, in the interface's voice (no apologies).
- **Fare / ETA chip.** Pill (radius 20), tinted Signal at low alpha, Signal text; tabular numerals. Used for "4 min away," distances, surge.
- **Nav / top bar.** Lowercase `rido` wordmark left (the voice register, since it's in-product), minimal chrome, white or ivory.
- **Bottom sheet.** The rideshare workhorse (request, driver-matched, in-progress). White, top radius 18, slides over a dimmed map. Tabular fare, primary CTA pinned bottom.
- **Map.** Light style; **Midnight markers, not red pins.** Route line in Midnight; live car/driver dot in Signal.
- **Toggle / status.** Driver online/offline as a clear switch; online = Signal.
- **Avatar.** Initials circle, Signal tint bg, Midnight text.

---

## 4. Voice in the UI (so copy matches design)
- Plain verbs, sentence case, active. Buttons name exactly what happens ("Get a rido," not "Submit"); the name stays consistent through the flow.
- Say what a thing does, not how it's built. "Driver keeps 87%," not "payout engine."
- Irreverence points *outward* (at incumbents, in marketing); warmth + steadiness point *inward* (at rider/driver, in product — getting in a car at night needs reassurance, not jokes).
- Empty/error/loading states give direction, not mood.

---

## 5. Screen blueprints (so Claude Design can start)

**Landing page (marketing — visual ROI highest, build in Design):**
Hero with the monument `RIDO` + a tangible-first headline (cheaper + fair, not "fight greed"); the mission as the resonant why below the fold; a driver-vs-incumbent take comparison (concrete numbers); "get a rido" as the spoken hook; the card-on-ivory aesthetic throughout; a clean CTA. Sleek like the apps Giorgi admires — but a distinct RIDO layout, *not* an Uber clone (the brand is anti-incumbent; it must not wear incumbent clothes).

**Rider request flow:**
Map-first (Midnight markers), bottom sheet for "where to?", fare + ETA shown in tabular numerals up front (honest pricing is the brand), `rido` lowercase in the top bar, primary "Get a rido" CTA. States: searching → matched (driver card) → en route → arrived → in trip → rate.

**Driver view:**
Online/offline toggle (Signal when online), incoming-request card with fare + **"you keep $X (Y%)"** front and center (the wedge, made visible), month-to-date earnings with the tier progress (show the graduated bands filling — turn the commission model into a motivator), accept/decline. Tabular numerals throughout.

---

## 6. Quality floor
Responsive to mobile, visible keyboard focus (Signal ring), reduced-motion respected, sufficient contrast (Midnight/Ink on light pass; check Signal-on-white for text uses). Light UI only — this is a fixed-palette brand, it does not invert to a dark theme unless a dark mode is deliberately designed.
