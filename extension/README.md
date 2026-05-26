# Crazy Good Buy — Facebook Marketplace Poster (Chrome extension)

Assisted posting of approved listings. The extension fills each Marketplace
listing's photos and fields in **your own logged-in Chrome**; **you** review and
click Facebook's Publish button. It never publishes on its own.

> Facebook has no posting API for individuals, and fully automated posting
> violates Meta's Terms of Service. This tool stays assisted on purpose: keep
> batches small (3–5), let the natural pauses run, and consider a dedicated
> account. You are responsible for what you publish.

## Folder convention (web app side)

In the web app, drag in a folder whose **subfolders are named by Shopify
product handle** (the slug in the product URL, e.g.
`crazygoodbuy.com/products/<handle>`). SKU also works as a fallback. Each
subfolder's photos become that product's real Marketplace images.

```
my-photos/
  kintera-kes3072s-equipment-stand/   <- handle
    IMG_0001.heic
    IMG_0002.jpg
  true-t-49-reach-in-cooler/
    front.jpg
```

## Install (one-time, per machine)

1. Open `chrome://extensions`, enable **Developer mode** (top right).
2. Click **Load unpacked** and select this `extension/` folder.
3. Log into Facebook normally in this Chrome profile.

## Use

1. In the web app: load the catalog, add photos, generate drafts, and
   **Approve** the listings you want. Click **Generate Extension Token** and copy
   the token.
2. Click the extension icon. Enter your **App URL** (where the web app is
   deployed) and paste the **Token**, then **Connect**.
3. Click **Start posting**. For each approved listing the extension opens the
   Marketplace create form, fills photos + title + price + description, and shows
   a review card. Set Category/Condition if blank, click Facebook's **Publish**,
   then click **Posted ✓ — Next** on the card.
4. The extension marks that listing posted, waits ~30–90s, and moves to the next.

## Troubleshooting

- **"Not connected" / 401:** token expired (7 days) — generate a new one.
- **Photos didn't attach:** Facebook changed the upload control; add them
  manually for that item. Update `SELECTORS.fileInput` in `content.js` if it
  recurs.
- **A field didn't fill:** Facebook changed its labels. Update the candidate
  strings in `SELECTORS` (title/price/description/condition/category) in
  `content.js`.
