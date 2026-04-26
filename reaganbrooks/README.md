# Reagan Brooks

Single-page brand site for Reagan Brooks LLC, a privately held holding company headquartered in Northeast Ohio.

## Stack

- **Next.js 16** (App Router, TypeScript, React Server Components by default)
- **CSS Modules** + CSS custom properties (no Tailwind, no utility framework, no UI kit)
- **EB Garamond** via `next/font/google` — the only typeface
- **No client JavaScript** beyond Next's runtime; the page is statically prerendered

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
npm run lint
```

## Where things live

```
cowork/
├─ brand-tokens.json            # source of truth for color, type, spacing, copy
├─ ASSET_SPEC.md                # binary asset spec for /public
└─ source/                      # design HTMLs (place artboards + brand guide here)

reaganbrooks/
├─ src/
│  ├─ styles/tokens.css         # CSS custom properties — mirrors brand-tokens.json
│  ├─ app/
│  │  ├─ layout.tsx             # font wiring, metadata, manifest, viewport
│  │  ├─ globals.css            # global resets and base type
│  │  ├─ icon.svg               # Ruled Square monogram (auto-wired by Next)
│  │  └─ page.tsx               # composes the section components in order
│  ├─ components/Wordmark.{tsx,module.css}
│  └─ sections/{Header,Statement,About,Believe,Portfolio,Approach,Contact,Footer}.{tsx,module.css}
└─ public/manifest.json         # PWA manifest per ASSET_SPEC.md
```

## Updating tokens

1. Edit `cowork/brand-tokens.json` (source of truth).
2. Sync `reaganbrooks/src/styles/tokens.css` by hand to match.
3. Section CSS consumes tokens via custom properties only — never hard-code hex or pixel values inside a section's `.module.css`.

## Updating copy

Copy is hardcoded inside each section component (no props, no JSON pipeline in v1). Authoritative strings live in `cowork/brand-tokens.json` under `voice.tagline`, `voice.boilerplate`, `portfolio[]`, and `contact`. To change a sentence, edit the corresponding file in `src/sections/`. The eight portfolio entries live in the `companies` array at the top of `Portfolio.tsx`; their order is meaningful — keep it as written.

## Brand guardrails

The visual identity is the deliverable; the code is just how it gets there. Read `cowork/source/03-brand-guidelines.html` before changing anything visual. The non-negotiables, condensed:

- **Typography:** EB Garamond is the only typeface. Never substitute a sans-serif. The full type scale lives in `brand-tokens.json` (displayXL/L/M, title, body, small, label, italicAccent) — pick a token, never an ad-hoc size.
- **Color:** Five tokens, no others. No `#FFFFFF` anywhere — Bone (`#F5F1E8`) is the page. Antique Brass is used sparingly: italic accents (Believe titles, portfolio categories), the footer rule, hover states.
- **Imagery:** None. No photography, no SVG illustrations, no gradients, no decorative glyphs. The only graphic elements are the wordmark, the RB monogram, hairline rules, and the brass rule above the footer.
- **Voice:** Patient, plainspoken, exact. Lift copy verbatim from `brand-tokens.json`. Avoid: "leverage", "synergy", "ecosystem", "platform", "mission-driven", "family office". Prefer: "operate", "own", "buy", "build", "holding company".
- **Motion:** None. No fade-ins, no parallax, no scroll-triggered reveals.
- **No emoji, no icon fonts, no chat widgets, no cookie banners, no analytics, no social links.** If a section feels empty, the answer is composition and whitespace.

## OG image

Generated at build time by `src/app/opengraph-image.tsx` using `next/og`. Composes the spec from `cowork/ASSET_SPEC.md`: stacked uppercase wordmark on Bone, 1px Antique Brass hairline below, 1200×630 PNG. The font is fetched once at build time from the @fontsource jsDelivr mirror — Satori (the engine inside `next/og`) requires woff/TTF/OTF rather than woff2, so the build-time font source differs from the live page's `next/font/google` import.

If the build environment has no outbound network, `app/opengraph-image.tsx` will fail to render. Vendor the woff into the repo if that becomes a problem.

## What is intentionally deferred

- **PNG icon set** (`favicon.ico`, `favicon-16/32`, `apple-touch-icon`, `icon-192/512`) per `cowork/ASSET_SPEC.md`. Need source HTMLs `cowork/source/05-avatars-favicons.html` (icon SVGs) and `cowork/source/08-monogram-exploration.html` to render. The SVG favicon (`app/icon.svg`) covers Chrome/Firefox/Safari/Edge in the meantime; iOS home-screen and Android adaptive icons fall back to the system default.
- **Email signature** — pending `cowork/source/04-email-signature.html`.
- **Visual diff** vs `cowork/source/01-website-desktop.html` and `02-website-mobile.html` — pending source files. The current implementation is built from `brand-tokens.json` plus the rendered text content of the artboards, not the artboards' actual markup.

## Deployment

Vercel. The page is statically prerendered (`○` in build output). No environment variables, no API routes, no edge runtime requirements.
