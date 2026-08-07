# brand/exports — Claude Design exports

Rendered design artifacts, kept as **pinned visual references**. Not source. Not a component
library. Nothing in `apps/web` imports from here.

## Two export formats

**Single-file bundle** (e.g. `2026-08-05-landing-v1.dc.html`): self-extracting — a base64 asset
manifest (mostly woff2 fonts), a JSON-encoded HTML template, and an unpacking script, all in one
file. **Never read one in full** — the 171KB landing export is ~30KB of actual markup wrapped in
~140KB of fonts. Reading one costs a large slice of context and returns almost no design
information; use the extraction script below instead.

**Multi-file handoff bundle** (e.g. `2026-08-07-landing-pages-v1/`): a directory — one or more
plain, readable `.dc.html` pages, a shared `_ds/` design-system folder (tokens, components,
readme), and a `support.js` runtime. The `.dc.html` files are **not self-contained**: they load
`_ds/` and `support.js` via relative `<script src>` tags, so the pages only render if the whole
directory travels together. They're small and plain-text — safe to read directly, no extraction
script needed. `support.js` and `_ds_bundle.js` exist **only to preview the pages in a browser**;
neither is part of the target app.

## Rules

1. **Every export has a handoff note** — sibling `<same-name>.md` for a single file, or
   `<folder-name>.md` next to the folder for a bundle. That note is the interface: what the
   surface is, what to build, what to ignore, what it contradicts. A bundle usually ships its own
   `README.md` inside the folder too (Design's own notes) — that's useful context, but it doesn't
   replace the handoff note, which is where *this repo's* known contradictions get flagged (see
   `2026-08-07-landing-pages-v1.md` for a real example: Design's own README calls its copy "final"
   while one page's numbers are stale against `../../docs/business/monetization.md`).
2. **Never transcribe.** Don't copy CSS or markup out of an export into the app. Rebuild with
   Tailwind tokens and `src/components/ui/`. Transcribing imports hardcoded hexes, absolute pixel
   values, and inlined `@font-face` blocks straight past every rule in the repo. This applies
   doubly to a bundle's `_ds/tokens/*.css` — reconcile new tokens into `apps/web/src/app/globals.css`
   deliberately, don't `@import` the design system's own CSS into the app.
3. **An export that contradicts `../design-system.md` or `../../docs/business/monetization.md` is
   a decision, not a value.** Update the source doc first, then build — never build from the
   export's number "because it's marked final."
4. Naming: `YYYY-MM-DD-<surface>-v<n>.dc.html` for a single file, `YYYY-MM-DD-<surface>-v<n>/` for
   a bundle. Keep old versions — they're the only record of what a surface used to look like.

## Extracting a single-file bundle without burning context

Only needed for the single-file format above — a multi-file bundle's `.dc.html` pages are already
plain text, just `Read` them directly.

```bash
python3 - <<'PY'
import re, json
src = "brand/exports/2026-08-05-landing-v1.dc.html"
s = open(src, encoding="utf-8").read()
tpl = json.loads(re.search(r'<script type="__bundler/template">(.*?)</script>', s, re.S).group(1))
open("/tmp/landing.html", "w", encoding="utf-8").write(tpl)
print(len(tpl), "chars written to /tmp/landing.html")
PY
```

Write what you learn into the handoff note. Don't commit the extraction.

## Index

| Export | Surface | Note |
|---|---|---|
| `2026-08-05-landing-v1.dc.html` | Marketing landing page (single-page, superseded by the row below) | `2026-08-05-landing-v1.md` |
| `2026-08-07-landing-pages-v1/` | Rider landing (`/`), driver landing (`/drivers`), about (`/about`) | `2026-08-07-landing-pages-v1.md` |
