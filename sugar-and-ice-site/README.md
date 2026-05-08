# Sugar + Ice — static site

Single-page brand site. Plain HTML/CSS, no build step, no framework.

```
sugar-and-ice-site/
  index.html      # landing → about → contact, all on one page
  404.html        # not-found
  style.css       # all styles
  _redirects      # Cloudflare Pages redirect rules
```

## Deploy to Cloudflare Pages

1. https://dash.cloudflare.com → **Workers & Pages** → **Create
   application** → **Pages** → **Upload assets**.
2. Project name: `sugar-and-ice`.
3. Drag this folder onto the upload area (or zip it first if drag-drop
   won't take a folder).
4. **Deploy site** — live at `https://sugar-and-ice.pages.dev` in ~60s.

## Connect thesugarandice.com (Squarespace registrar → Cloudflare DNS)

1. **Cloudflare** → **Add a Site** → `thesugarandice.com` → **Free** plan.
   Copy the two nameservers Cloudflare gives you.
2. **Squarespace** → https://account.squarespace.com → Domains →
   `thesugarandice.com` → DNS → switch to **Custom nameservers** → paste
   the Cloudflare ones. Save.
3. Wait for the activation email (5 min – a few hours).
4. **Cloudflare** → **Workers & Pages** → `sugar-and-ice` project →
   **Custom domains** → **Set up a custom domain** → `thesugarandice.com`
   → **Activate**. Repeat for `www.thesugarandice.com`.

## Contact form

Posts to `mailto:chase@thesugarandice.com`. Submitting opens the visitor's
email client with the form values. Works without setup.

For inbox-style submissions, sign up free at https://formspree.io and
replace the `action` attribute in `index.html`:

```html
<!-- old -->
<form class="si-quote-form" action="mailto:chase@thesugarandice.com" method="post" enctype="text/plain">

<!-- new -->
<form class="si-quote-form" action="https://formspree.io/f/YOUR_ID" method="post">
```
