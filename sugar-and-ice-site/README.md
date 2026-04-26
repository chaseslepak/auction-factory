# Sugar + Ice — static site

Plain HTML/CSS. No build step, no framework. Drop the contents of this folder
into Cloudflare Pages.

## Files

```
sugar-and-ice-site/
  index.html        # home
  about/index.html  # our story
  visit/index.html  # book the trailer + quote form
  404.html          # not-found page
  style.css         # all styles
  _redirects        # Cloudflare Pages redirect rules
```

## Deploy to Cloudflare Pages (5 minutes)

1. Go to https://dash.cloudflare.com → **Workers & Pages** → **Create
   application** → **Pages** → **Upload assets**.
2. Project name: `sugar-and-ice` (this becomes the
   `sugar-and-ice.pages.dev` preview URL).
3. Drag the entire `sugar-and-ice-site` folder onto the upload area, or zip
   it and upload the zip.
4. Click **Deploy site**. Live within 60 seconds at
   `https://sugar-and-ice.pages.dev`.

## Connect thesugarandice.com

The domain is registered at Squarespace; we'll move DNS to Cloudflare so
Cloudflare Pages can serve the apex.

### 1. Add the domain to Cloudflare DNS

1. In the Cloudflare dashboard, click **Add a Site** → enter
   `thesugarandice.com` → pick the **Free** plan.
2. Cloudflare gives you two nameservers (e.g. `xxx.ns.cloudflare.com`).
   Copy them.

### 2. Switch nameservers at Squarespace

1. Log into https://account.squarespace.com → **Domains** →
   `thesugarandice.com` → **DNS**.
2. Change to **Use custom nameservers** and paste the two Cloudflare
   nameservers.
3. Save. Propagation takes 5 min – a few hours; Cloudflare emails you when
   it's active.

### 3. Attach the domain to the Pages project

1. In Cloudflare → **Workers & Pages** → click your `sugar-and-ice`
   project → **Custom domains** → **Set up a custom domain**.
2. Enter `thesugarandice.com` → **Continue** → **Activate domain**.
   Cloudflare creates the DNS records and SSL cert automatically.
3. Repeat for `www.thesugarandice.com` (Cloudflare auto-redirects www →
   apex).

### 4. Test

- https://thesugarandice.com → home
- https://thesugarandice.com/about/ → our story
- https://thesugarandice.com/visit/ → book the trailer
- https://thesugarandice.com/visit/#quote → quote form

## The quote form

Currently set to `mailto:hello@thesugarandice.com`. Submitting opens the
visitor's email client with the form values as the body. Works everywhere,
zero setup.

To get inbox-style submissions instead, sign up free at
https://formspree.io, get an endpoint URL, and replace the form's `action`
attribute in `visit/index.html`:

```html
<!-- old -->
<form class="si-quote-form" action="mailto:hello@thesugarandice.com" method="post" enctype="text/plain">

<!-- new -->
<form class="si-quote-form" action="https://formspree.io/f/YOUR_ENDPOINT" method="post">
```

Re-upload to Cloudflare Pages or push to the connected git branch.

## Updating the site later

Two options:
- **Re-upload**: Cloudflare Pages → project → **Create deployment** → drag
  the folder again. Each deploy gets a unique preview URL plus updates the
  production domain.
- **Git-connected**: connect this folder (or its own repo) to Cloudflare
  Pages once. Every push deploys automatically.
