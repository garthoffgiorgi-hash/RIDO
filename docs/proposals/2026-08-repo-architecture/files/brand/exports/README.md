# brand/exports — Claude Design exports

Rendered design artifacts, kept as **pinned visual references**. Not source. Not a component
library. Nothing in `apps/web` imports from here.

## Rules

1. **Never read a `.dc.html` in full.** They're self-extracting bundles: a base64 asset manifest
   (mostly woff2 fonts), a JSON-encoded HTML template, and an unpacking script. The 171KB landing
   export is ~30KB of actual markup wrapped in ~140KB of fonts. Reading one costs a large slice of
   a context window and returns almost no design information.
2. **Every export has a sibling `<same-name>.md` handoff note.** That note is the interface — what
   the surface is, what's new in this version, what to build, what to ignore, what it contradicts.
   Read the note; open the bundle in a browser if you need to *see* it.
3. **Never transcribe.** Don't copy CSS or markup out of an export into the app. Rebuild with
   Tailwind tokens and `src/components/ui/`. Transcribing imports hardcoded hexes, absolute pixel
   values, and inlined `@font-face` blocks straight past every rule in the repo.
4. **An export that contradicts `../design-system.md` is a decision, not a value.** Update the
   design system first, then build.
5. Naming: `YYYY-MM-DD-<surface>-v<n>.dc.html`. Keep old versions — they're the only record of
   what a surface used to look like.

## Extracting one without burning context

If you need the markup rather than the picture:

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
| `2026-08-05-landing-v1.dc.html` | Marketing landing page | `2026-08-05-landing-v1.md` |
