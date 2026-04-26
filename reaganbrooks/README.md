# Reagan Brooks

Single-page brand site for Reagan Brooks LLC, a privately held holding company headquartered in Northeast Ohio.

## Stack

- **Next.js 16** (App Router, TypeScript, React Server Components by default)
- **CSS Modules** + CSS custom properties (no Tailwind, no utility framework, no UI kit)
- **EB Garamond** via `next/font/google` — the only typeface
- **No JavaScript on the client** beyond Next's runtime; the page is statically prerendered

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
src/
├─ styles/
│  └─ tokens.css            # design tokens (colors, type, spacing) — single source of truth
├─ app/
│  ├─ layout.tsx            # root layout, font wiring, metadata, viewport
│  ├─ globals.css           # global resets and base type
│  └─ page.tsx              # composes the section components in order
├─ components/
│  └─ Wordmark.{tsx,module.css}   # stacked REAGAN / rule / BROOKS
└─ sections/
   ├─ Header.{tsx,module.css}
   ├─ Statement.{tsx,module.css}
   ├─ About.{tsx,module.css}
   ├─ Believe.{tsx,module.css}
   ├─ Portfolio.{tsx,module.css}
   ├─ Approach.{tsx,module.css}
   ├─ Contact.{tsx,module.css}
   └─ Footer.{tsx,module.css}
```

## Updating tokens

Edit `src/styles/tokens.css`. All sections consume tokens via CSS custom properties — never use raw hex values inside section CSS.

The token file mirrors the values in `cowork/brand-tokens.json`. If `brand-tokens.json` is updated, sync `tokens.css` by hand and verify the diff.

## Updating copy

Copy is hardcoded inside each section component (no props, no JSON pipeline in v1). To change a sentence, edit the corresponding file in `src/sections/`. The eight portfolio entries live in the `companies` array at the top of `src/sections/Portfolio.tsx`; their order is meaningful — keep it as written.

## Brand guardrails

The visual identity is the deliverable; the code is just how it gets there. Read `cowork/source/03-brand-guidelines.html` before changing anything visual. The non-negotiables, condensed:

- **Typography:** EB Garamond is the only typeface. Never fall back to a sans-serif. Headlines use weight 500 with letter-spacing `-0.012em`. Tracked uppercase labels use weight 500 at 12px with `0.42em` tracking.
- **Color:** Five tokens, no others. No `#FFFFFF` anywhere — Bone (`#F5F1E8`) is the page. Antique Brass is used sparingly (Believe titles, footer rule, hover states).
- **Imagery:** None. No photography, no SVG illustrations, no gradients, no decorative glyphs. The only graphic elements are the wordmark, the RB monogram, hairline rules, and the brass rule above the footer.
- **Voice:** Plainspoken. Restrained. Operator-led. Lift copy verbatim from `brand-tokens.json`. Never paraphrase. Never write "family office" — the firm is a "holding company."
- **Motion:** None. No fade-ins, no parallax, no scroll-triggered reveals.
- **No emoji, no icon fonts, no chat widgets, no cookie banners, no analytics, no social links.** If a section feels empty, the answer is composition and whitespace.

## What is intentionally deferred

- **Favicons / OG image / monogram avatar** — pending the asset specs in `cowork/ASSET_SPEC.md`. Wire into `app/layout.tsx` `metadata.icons` and `metadata.openGraph.images` once produced.
- **Email signature page** — `cowork/source/04-email-signature.html` not yet implemented.

## Deployment

Vercel. The page is statically prerendered (`○` in the build output) — Edge runtime is fine. No environment variables, no API routes.
