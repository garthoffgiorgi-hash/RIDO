# Handoff: RIDO Landing Pages (Rider / Driver / About)

## Overview
Three landing pages replacing the single-page RIDO site: a rider-focused page (home), a driver-focused page (economics + requirements), and an About page (mission, commission model, contact).

## About the Design Files
The `.dc.html` files here are **design references**, built in a proprietary in-browser component format (`support.js` + inline-styled template) — not production code to copy directly. They render standalone in a browser (open `RIDO Rider.dc.html` etc.) using the bundled `_ds/` design-system assets and `support.js` runtime included in this folder, for visual reference only.

**Task:** recreate these designs in the target stack (Next.js + TypeScript, per the repo's `CLAUDE.md`) using React/Tailwind or the codebase's existing component patterns — not by embedding these HTML files.

## Fidelity
**High-fidelity.** Colors, type, spacing, and copy are final. Recreate pixel-close using the values below.

## Pages

### 1. RIDO Rider.dc.html (site home, `/`)
- Sticky nav: wordmark, "For riders / For drivers / About" links, primary "Get a rido" button.
- Hero: badge ("Now live in {city}" — tweakable), H1 "Cheaper. Fairer. Your rido is waiting.", subhead, dual CTA, 3-stat row (87% / ~15% / $0), floating fare + driver-cut cards.
- "How it works" (rider): 3-step card grid (map-pin / car-front / badge-dollar-sign icons).
- "Why it's cheaper" teaser: 2-col text + link to About, plus a small trust card (locked pricing, live tracking).
- Shared footer (4-col: brand, Rider, Driver, Company links).

### 2. RIDO Driver.dc.html (`/drivers`)
- Nav (driver tab active), CTA "Drive with rido".
- Hero: badge ("$0 driver fees for 6 months"), H1 with computed $ advantage, dual CTA.
- Driver economics: live bar-chart comparison (rido vs. incumbent take), driven by `monthlyFares` and `incumbentTakePct` props — bracketed commission math (20%/12%/8%) in the logic class.
- "How it works" (driver): 3-step grid (power / hand-coins / trending-up icons).
- Requirements: 5-icon row (21+/license, 2010+ vehicle, insurance, background check, clean record).
- Testimonials: 3 illustrative driver quote cards (labeled as illustrative, not verbatim reviews).
- Midnight CTA band, shared footer.

### 3. RIDO About.dc.html (`/about`)
- Nav (About tab active).
- Midnight mission hero (full-bleed), matching the mission copy from the original single-page site.
- Origin section: UCSD/San Diego pilot story (`pilotMonths` prop, default 6).
- Commission tiers: 3-card breakdown of the graduated bands (20% / 12% / 8%), with the $3,600 GMV worked example.
- Contact: general email, press email, San Diego location.
- Shared footer.

## Design Tokens (from the bound RIDO design system)
- Colors: Midnight `#0B2A5B`, Signal `#2A5BFF`, Ivory `#F7F5EF`, White `#FFFFFF`, Mist (border) — see `_ds/.../tokens/colors.css`.
- Type: Sora (display/headlines), Plus Jakarta Sans (body/UI) — see `tokens/fonts.css`. Tabular numerals (`font-feature-settings: "tnum" 1`) on all fares/percentages/counts.
- Spacing: 8px rhythm, 4px half-step. Radius: 12px inputs/buttons, 16–18px cards, 999px pills.
- Components used: Button (primary/secondary/accent/ghost), Badge, FareChip, Avatar — see `_ds/.../components/`.

## Interactions & Behavior
- Nav links are simple page-to-page navigation (3 static routes).
- Buttons: press = `scale(0.98)`, focus = 3px Signal ring (see design system `base.css`).
- No client-side state beyond the driver economics calculator (pure function of two inputs, recomputed on prop change — trivial to port to a `useMemo`).

## Assets
Icons are Lucide (`https://unpkg.com/lucide`), 2px stroke, `currentColor` — swap for the codebase's icon import (e.g. `lucide-react`) using the same icon names referenced in each file's `data-lucide` attributes.

## Files in this bundle
- `RIDO Rider.dc.html`, `RIDO Driver.dc.html`, `RIDO About.dc.html` — the three page designs.
- `_ds/` — full design-system bundle (tokens, components, styles) referenced by the pages.
- `support.js` — runtime required only to preview these `.dc.html` files in a browser; not part of the target app.
