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
- Control height: **44px** for inputs and buttons alike — the iOS/Android minimum comfortable
  tap target, and one height for every control keeps a form or a bottom sheet visually level.
  (An earlier duplicate spec used 52px; 44px wins because it's the value already load-bearing
  elsewhere in this doc — see "Touch targets ≥ 44px" below — and two heights for the same class
  of control had no stated reason to differ.)
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
- **Inputs.** White fill, `--mist` border, radius 12, 44px tall (see Spacing & shape); focus → `--signal` ring. Labels in Slate, sentence case. Errors state what's wrong and how to fix it, in the interface's voice (no apologies).
- **Fare / ETA chip.** Pill (radius 20), tinted Signal at low alpha, Signal text; tabular numerals. Used for "4 min away," distances, surge.
- **Nav / top bar.** Lowercase `rido` wordmark left (the voice register, since it's in-product), minimal chrome, white or ivory.
- **Bottom sheet.** The rideshare workhorse (request, driver-matched, in-progress). White, top radius 18, slides over a dimmed map. Tabular fare, primary CTA pinned bottom. Dim value: `bg-ink/40` — undecided until `apps/web/src/components/ui/Sheet.tsx` needed one; recorded here now that it's built.
- **Map.** Light style; **Midnight markers, not red pins.** Route line in Midnight; live car/driver dot in Signal.
- **Toggle / status.** Driver online/offline as a clear switch; online = Signal.
- **Avatar.** Initials circle, Signal tint bg, Midnight text.

---

## 4. Motion

- **Default:** subtle, purposeful, never decorative. `transition: 150–200ms ease`.
- **Splash beat:** lowercase `rido` appears → the Signal-blue i-dot pulses outward (locate-signal
  ping, `scale(1) → scale(2.6), opacity(0.7) → opacity(0)`, ~600ms ease-out) → resolves into
  uppercase `RIDO` icon. Voice becoming monument. One ring, one pulse.
- **Bottom sheet:** slides up with `cubic-bezier(0.32, 0.72, 0, 1)`, 320ms.
- **Reduced motion:** all animations off except instant state transitions. Respect
  `prefers-reduced-motion`.

---

## 5. Voice in the UI (so copy matches design)
- Plain verbs, sentence case, active. Buttons name exactly what happens ("Get a rido," not "Submit"); the name stays consistent through the flow.
- Say what a thing does, not how it's built. "Driver keeps ~86%," not "payout engine."
- Irreverence points *outward* (at incumbents, in marketing); warmth + steadiness point *inward* (at rider/driver, in product — getting in a car at night needs reassurance, not jokes).
- Empty/error/loading states give direction, not mood.

---

## 6. Screen blueprints (so Claude Design can start)

**Landing page (marketing — visual ROI highest, build in Design):**
Hero with the monument `RIDO` + a tangible-first headline (cheaper + fair, not "fight greed"); the mission as the resonant why below the fold; a driver-vs-incumbent take comparison (concrete numbers); "get a rido" as the spoken hook; the card-on-ivory aesthetic throughout; a clean CTA. Sleek like the apps Giorgi admires — but a distinct RIDO layout, *not* an Uber clone (the brand is anti-incumbent; it must not wear incumbent clothes).

**Rider request flow:**
Map-first (Midnight markers), bottom sheet for "where to?", fare + ETA shown in tabular numerals up front (honest pricing is the brand), `rido` lowercase in the top bar, primary "Get a rido" CTA. States: searching → matched (driver card) → en route → arrived → in trip → rate.

**Built so far (`/request`, ADR-0012, ADR-0013, ADR-0014):** *naming* (two place fields), *quoted*
(`Fare` + `FareChip` ETA, `"Get a rido"`), a *price-changed* state this blueprint didn't
anticipate — the fare is re-quoted server-side at confirm, and if it moved, the rider re-confirms
rather than being silently charged a different number — *requested* ("looking for a driver,"
cancelable only here), *matched* ("Your driver is on the way," once accepted), and now *in trip*
too ("You're on your way," once the driver starts). A trip-complete summary (fare paid, dismissable
back to booking) closes the loop once the ride finishes. No realtime anywhere in this list — every
state change appears on the rider's next reload, not live. `arrived` (a driver-facing "I'm here"
action) and `rate` are what's left. `"Get a rido"` keeps its name through every state per section
5 — a changed price never becomes a relabeled button.

**Driver view:**
Online/offline toggle (Signal when online), incoming-request card with fare + **"you keep $X (Y%)"** front and center (the wedge, made visible), month-to-date earnings with the tier progress (show the graduated bands filling — turn the commission model into a motivator), accept/decline. Tabular numerals throughout.

**Built so far (`/drive`, ADR-0013, ADR-0014):** the incoming-request card, as `RideCard` — fare,
both addresses, and **"you keep $X (Y%)"** in tabular numerals, computed live via
`commissionForRide` since a requested ride has no snapshot yet — and Accept, a single race-proof
write. Once accepted, `CurrentRidePanel` takes over with the same live figure and one button that
becomes **Start trip**, then **Complete ride** — completing swaps it for the real earned amount,
the first number in this app ever computed by the deployed `complete-ride` function rather than
locally. Above both sits `PayoutCard` (ADR-0015) — an **Earnings** card leading with the amount
already sent to the driver's bank as a `Fare`, then anything still owed. Until Connect onboarding
finishes it carries an Accent/live button ("Connect your bank", or "Finish payout setup" once
started) into Stripe's hosted flow, since RIDO never collects a bank detail itself.

**The toggle and decline are built (ADR-0019).** Availability is a two-option `SegmentedControl`
("Offline | Online") sitting directly under the compliance card, above both panels — a driver
mid-ride still needs to reach it. The control gains an `accent` tone for exactly this use, so the
active *Online* segment fills Signal per section 3's "online = Signal"; every other segmented
control on the auth surfaces keeps the white-active default. Decline is deliberately the quieter
half of the request card: a small `ghost` control, never a second full-width button under Accept,
because one mis-tap on a phone permanently removes a request a driver wanted and the product has no
undo. While offline the board stays fully visible and Accept is disabled — with the reason in
rendered text at the top of the panel, once, not a tooltip (a disabled `Button` carries
`pointer-events-none`, so it can never show one) and not repeated on every card.

**The open-request board updates itself** (ADR-0021): a new request appears without a reload. A
ride another driver took cannot arrive over that channel — it leaves the rest of the pool's
visibility the moment it is claimed — so it clears on the next arrival, on returning to the tab, or
on the accept attempt's existing refusal. No spinner, no connection state, nothing announcing the
socket; the board simply gains a card.

**Month-to-date tier progress is built**, as `TierProgress` — sitting between the ride panels and
`PayoutCard`, the month's *rate* story before its *cash* story. The graduated bands fill left to
right, one segment per tier, widths proportional to each band's real width; the unbounded top band
gets a fixed share so it never reads as a segment a driver could complete. Every fact — this
month's fares, what was kept, the current and next rate — is stated in tabular-numeral prose beside
the meter, which is purely decorative (`aria-hidden`) since nothing in it has a single value an
`aria-valuenow` could honestly describe. Motivates by being honest, never by urgency: no countdown
framing, no "$340 to go."

**The hold is disclosed, never discovered.** A rider is told what will be held and what will be
charged, before they tap — "we'll hold a little more than this while you ride, and charge $X when
your trip ends." Honest pricing is the product (`brand-guide.md`); a rider finding a larger number
on their statement than the one they agreed to is the incumbent behaviour RIDO is positioned
against, and it stays that way even when the difference is only a temporary authorization.

**A card form is RIDO's, even though it's Stripe's.** The one piece of third-party UI in the product
takes the brand's tokens — Signal for focus, Ink for text, 12px radii, Plus Jakarta Sans — rather
than arriving in Stripe's defaults. `apps/web/src/lib/payments/browser.ts` passes them through.

**Cancelling late names the cost and where it goes.** Not "a fee applies": the amount, and that it
goes to the driver for time already spent. The alternative — a rider discovering the charge
afterwards — would be the one place the product's voice could not survive being read twice. The
confirm reads *"Cancel and pay $X"*, and its escape reads *"Keep my ride"*, because a rider who
changes their mind at a confirmation dialog is choosing the ride, not dismissing a modal.

**A payout state is never dressed as a failure.** Money owed but not yet sent — a driver who hasn't
linked a bank, a transfer that will be retried — is Slate, and says the earnings are recorded and
waiting. Only a terminal refusal takes the danger token, and it is the only state that gets a Retry
button: offering one where it would change nothing is worse than offering none. This is section 5's
"empty/error states give direction, not mood" where it matters most — a driver reading their own
earnings.

---

## 7. Quality floor
Responsive to mobile, visible keyboard focus (Signal ring), reduced-motion respected, sufficient contrast (Midnight/Ink on light pass; check Signal-on-white for text uses). Light UI only — this is a fixed-palette brand, it does not invert to a dark theme unless a dark mode is deliberately designed.
