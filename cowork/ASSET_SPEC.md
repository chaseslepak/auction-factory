# Asset Spec — Binary Files to Produce

Every file below must end up in `/public` of the production site. Source mark definitions are in `source/05-avatars-favicons.html` and `source/08-monogram-exploration.html`.

## Favicon set

| File | Size | Format | Source mark |
|---|---|---|---|
| `favicon.ico` | 16 / 32 / 48 multi-res | ICO | Tiny variant — Bone bg, Slate Navy mark, 4pt frame stroke, 600-weight letterforms |
| `favicon-16.png` | 16 × 16 | PNG | Tiny variant |
| `favicon-32.png` | 32 × 32 | PNG | Tiny variant |
| `apple-touch-icon.png` | 180 × 180 | PNG | Standard mark — Bone bg, Slate Navy ruled square + RB |
| `icon-192.png` | 192 × 192 | PNG | Standard mark |
| `icon-512.png` | 512 × 512 | PNG | Standard mark |

**Tiny variant rationale:** Chrome's pixel grid destroys 1.6pt strokes at 16/32px. Use a heavier 4pt stroke and 600-weight RB at those sizes only. See `source/05-avatars-favicons.html` `#rb-bone-tiny` symbol for the exact SVG.

## Open Graph

| File | Size | Format | Composition |
|---|---|---|---|
| `og-image.png` | 1200 × 630 | PNG | Bone bg. Stacked uppercase wordmark centered (REAGAN / 14px Slate Navy rule / BROOKS), letter-spacing 0.28em, EB Garamond Medium 64pt. 1pt Antique Brass hairline rule 80px below the wordmark, 240px wide. |

## Logo SVGs

| File | Use |
|---|---|
| `logo-wordmark-navy.svg` | Stacked wordmark, Slate Navy ink, transparent bg |
| `logo-wordmark-bone.svg` | Stacked wordmark, Bone ink, transparent bg (for placement on Slate Navy) |
| `logo-monogram-navy.svg` | Ruled Square monogram, Slate Navy, transparent bg |
| `logo-monogram-bone.svg` | Ruled Square monogram, Bone, transparent bg |

**SVG construction:**
- Wordmark: two `<text>` elements (`REAGAN`, `BROOKS`), font `EB Garamond`, weight 500, letter-spacing `0.28em`, with a 12px-wide horizontal `<rect>` between them at 50% line-height. Outline the text on export so the SVG renders without the font.
- Monogram: a `<rect>` with `fill="none"` `stroke-width="1.6"` at 72×72 inset 14 from a 100×100 viewBox, plus an `RB` `<text>` element centered, font `EB Garamond`, weight 500, font-size 46, letter-spacing -1. Outline the text on export.

## Manifest

`manifest.json`:
```json
{
  "name": "Reagan Brooks",
  "short_name": "Reagan Brooks",
  "description": "A privately held holding company.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F5F1E8",
  "theme_color": "#F5F1E8",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

## How to generate

The fastest path is to render the SVGs in `source/05-avatars-favicons.html` (`#rb-bone`, `#rb-navy`, `#rb-bone-tiny`, `#rb-navy-tiny` symbols) into PNGs at the sizes above using `sharp` or `puppeteer`. A short Node script in `scripts/build-assets.mjs` is sufficient — render once, commit the binaries to `/public`.
