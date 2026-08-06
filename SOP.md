# Auction Factory Official Lotter — SOP & Instruction Manual

**Auction Factory | Standard Operating Procedure**
**Version:** 2.0 | **Last Updated:** August 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Locations](#locations)
4. [Creating an Auction](#creating-an-auction)
5. [Lotting Items](#lotting-items)
6. [Reviewing & Editing Lots](#reviewing--editing-lots)
7. [Stock Images & Pricing](#stock-images--pricing)
8. [Uploading to Auction Factory](#uploading-to-auction-factory)
9. [Managing Your Auction](#managing-your-auction)
10. [Admin Panel](#admin-panel)
11. [Troubleshooting](#troubleshooting)
12. [Quick Reference](#quick-reference)

---

## Overview

The Auction Factory Official Lotter is a mobile-first web app that lets warehouse staff photograph items and instantly generate professional auction listings using AI. Listings are then uploaded directly to the Auction Factory backend by HQ.

**App URL:** https://lotter.auctionfactory.com

**What it does:**
- Snap photos of items from your phone
- AI identifies the item, writes the description, finds retail pricing
- HQ pushes the finished auction live on Auction Factory
- Works on iPhone, Android, or desktop
- Per-location scoping so each AF location sees only their own auctions

---

## Getting Started

### First-Time Login

1. Open **https://lotter.auctionfactory.com** on your phone or computer
2. Enter your authorized email address
3. Tap **Send Magic Link**
4. Check your email — click the link to sign in

**If the magic link is slow or doesn't arrive**, tap "Use password instead" on the login screen. Your admin can set your initial password. To create your own, tap **Set Password** and follow the emailed reset link.

### Installing on Your Phone

The app is a PWA — install it to your home screen for a real-app experience (fullscreen, no browser bar). On first visit, you'll see an "Install the lotter" card at the top.

**iPhone (Safari):**
1. Tap the Share button (square with arrow) at the bottom
2. Tap **Add to Home Screen**
3. Tap **Add**

**Android (Chrome):**
1. Tap **Install** in the app's "Install the lotter" card, or
2. Tap the three-dot menu → **Install App**

### First-Time Location Setup

If you're a lotter (not admin), the first time you visit the Auctions page you'll be asked to **pick your location** (e.g. Texas, California, Mideast). This determines which auctions you see. Ask your admin to change it later if needed.

---

## Locations

Each AF location has its own bucket of auctions. Lotters only see auctions from their assigned location — this keeps each location's work separate.

**Above the auctions list**, you'll see a location dropdown:
- Defaults to **your location**
- Pick **All locations** to see auctions from every location
- Pick a specific location to peek at another (nothing is hidden — this is a filter, not a permission wall)

**When you create an auction**, it's automatically stamped with your location. Admins can pick any location when creating.

**Admins** see all locations by default and can filter to any single one via the dropdown.

To rename or add locations, edit the `locations` table in Supabase → Table Editor.

---

## Creating an Auction

1. From the **Auctions** page, tap **New Auction**
2. Enter the auction name (e.g., "Texas - Restaurant Blowout #4")
3. If you're an admin, pick the location from the dropdown. Lotters skip this — your location is auto-stamped.
4. Tap **Create**
5. Your new auction appears in the list — tap it to start lotting

---

## Lotting Items

This is the core workflow — what you'll do in the warehouse.

### Step 1: Take Photos

1. Open your auction and tap **New Lot**
2. Tap **Add Photo** to open your camera or photo library
3. Take 2-5 clear photos of the item:
   - **Front/overview shot** (most important — becomes the thumbnail)
   - **Brand/model plate** (helps AI identify it accurately)
   - **Any damage or wear** (for honest condition reporting)
   - **Size reference** if possible
4. Photos are automatically resized and compressed

**Tips for better photos:**
- Good lighting makes a huge difference
- Get the brand name/logo in at least one shot
- Shoot the model number plate if visible
- Include all sides for large equipment
- The app will warn you if a photo is very low resolution — retake if you see the yellow "Low quality" badge

### Step 2: Set Condition

Select the condition from the dropdown:
- **10 - New in box** (sealed, never opened)
- **9 - Like New** (opened but unused)
- **8 - Excellent** (minimal signs of use)
- **7 - Good** (normal wear, fully functional)
- **6 - Average** (moderate wear)
- **5 - Well used** (heavy wear but works)
- **4 - Functions** (works but showing age)
- **3 - Needs parts** (missing components)
- **2 - Repairable** (broken but fixable)
- **1 - Broken** (for parts only)

### Step 3: Set Quantity

- Default is **1** (one item per lot)
- If you have multiples (e.g., case of 6 mixing bowls), enter **6**
- This adds "Bid X 6" to the listing description

### Step 4: Add Notes (Optional)

Type or **tap the microphone icon** to dictate notes for the AI:
- "This is a Hoshizaki ice machine, model visible on the back"
- "New in box, never opened"
- "Missing one shelf, otherwise good"
- "Gridmann brand, retail $250"

### Step 5: Generate Listing

Tap **Generate Listing** and wait 10-20 seconds. The AI will:
- Identify the item from your photos
- Look up the brand and model
- Find the highest retail price from multiple retailers
- Write a professional auction description
- Assign a confidence level (high/medium/low)

### Lotting with a Partner

Two lotters can work the same auction in parallel:
1. Before lotting, each person taps "Change start" on the new-lot page
2. Person A stays at lot 1, Person B starts at (say) lot 100
3. You won't collide as long as you leave a buffer between starting numbers

---

## Reviewing & Editing Lots

After generating, you'll see the review screen.

### What to Check

1. **Item name** — Is the brand and model correct?
2. **Retail price** — Does it look reasonable?
3. **Description** — Read through for accuracy
4. **Confidence** — "Low" means the AI isn't sure, double-check manually
5. **Duplicate warning** — Yellow banner if same brand+model already exists in this auction

### Editing Before Save

1. Tap **Edit Listing**
2. Modify any field: name, brand, model, category, price, description
3. Changing the retail price auto-recalculates the listed price (+10%)
4. Tap **Done Editing** when finished

### Saving

- **Single Lot**: Tap **Save Lot**
- **Range / Dupes**: Toggle to Range, enter how many identical lots (e.g., "8" creates lots #X through #X+7 with identical data)
- Tap **Save Lots**

### Undoing a Delete

If you delete a lot by mistake, a yellow **Undo** toast appears at the bottom for ~5 seconds. Tap it to restore. After that, admins can still recover the lot from **Admin → Trash**.

### Editing After Save

1. From the auction detail page, tap any lot to open it
2. Tap **Edit Listing** to modify fields
3. Tap **Save Changes**
4. Changes are tracked in the edit history (tap **History** button to see)

### Managing Photos on Saved Lots

In edit mode on a saved lot:
- **Delete a photo**: Tap the red X on any photo
- **Add photos**: Tap the + box at the end
- **Reorder**: Use the arrow buttons to move photos left/right
- **Primary photo**: First photo (marked "PRIMARY") becomes the AF thumbnail

---

## Stock Images & Pricing

### Automatic Stock Images

When you generate a listing, the AI automatically:
1. Searches retailer sites for the exact brand+model
2. Verifies the match with AI vision
3. Downloads the stock image and sets it as the primary photo
4. Pulls the real retail price from the search results

### Manual Stock Image Scan

For lots that didn't get a stock image during generation:
1. Go to the auction detail page
2. Tap **Find Stock Images** (above the Upload button)
3. This runs in the background — you can close the tab
4. Progress shows on the page and in Admin > Jobs

### Deep Rescan (For Inaccurate Lots)

If specific lots have wrong identification or pricing:
1. Tap **Select** on the lot list
2. Select the inaccurate lots
3. Tap the purple **Deep Rescan** button
4. This uses the most powerful AI model to re-identify and re-price

### Pricing

The listed price is calculated as:
**Highest found retail price x 1.10 (10% markup)**

Sources checked (highest wins):
- AI's internal knowledge
- WebstaurantStore actual price
- Claude web search across 5+ retailer sites

---

## Uploading to Auction Factory

Most locations do **not** upload directly. When your auction is fully lotted, hand it off to HQ (Chase) via the **Mark Ready for HQ** button. HQ pushes it live for you.

If you're a lotter with direct upload permission, follow the AF Browser Upload flow below.

### Hand Off to HQ (Recommended for Locations)

1. Finish lotting all items
2. On the auction detail page, tap **Mark Ready for HQ**
3. HQ gets notified — they'll push it to AF for you
4. You'll see status change from "Ready" → "Uploading" → "Done"

### First Time: Link Your AF Auction (Direct Upload Only)

1. In the auction detail page, tap **Link AF Auction for Upload**
2. Select your auction from the dropdown (fetched from AF admin)
3. Tap **Link**

### Browser Upload (Direct — Recommended When Uploading Yourself)

This is the most reliable direct method. It runs from your browser.

1. **Log into AF admin** in Chrome: go to auctionfactory.com/admin
2. Navigate to any page inside /admin (stay logged in)
3. In another tab, open the lotter app > your auction
4. Tap the green **Browser Upload (recommended)** button
5. Tap **Generate Script** > **Copy Script**
6. Switch to the AF admin tab
7. Press **Cmd+Option+J** (Mac) or **F12** (Windows) to open the console
8. Paste the script and press Enter
9. A progress window appears in the top-right
10. Wait until it shows DONE
11. Verify lots appeared correctly in AF admin

**Why this method:** It runs from your real browser session, so AF's server sees a normal logged-in user — no bot protection issues.

### Server Upload (Fallback)

The navy **Server Upload** button is the old method. It works but may have occasional failures due to AF's bot protection. Use Browser Upload instead.

### After Upload

- Lots marked with a green **AF** badge = successfully uploaded
- Lots marked **Failed** = need attention
- Use the **Reset from First Failed Lot** button if failures break the sequence

---

## Managing Your Auction

### Search & Filter

On the auction detail page:
- **Search box**: Filter by item name, brand, model, or lot number
- **Status filter**: All / Not uploaded / Uploaded / Failed
- **Sort**: Lot number / Price high-low / Price low-high / Confidence

### Bulk Actions

1. Tap **Select** to enter bulk mode
2. Tap lots to select them (blue border = selected)
3. Actions available:
   - **Deep Rescan** — re-analyze selected lots with premium AI
   - **Edit** — bulk change price (multiplier), category, or condition
   - **Delete** — soft-delete selected lots (recoverable from trash)

### Archiving

When an auction is complete:
1. Go to the Auctions list
2. Tap **Archive** on the finished auction
3. It moves to the archived view
4. Tap **View Archived** to see past auctions
5. Tap **Restore** to bring one back

### Exporting

On the auction detail page, in the stats card, tap **Export to CSV** to download all lot data as a spreadsheet.

---

## Admin Panel

Access via **Admin** link on the auctions list page. Admin access only.

### Users

Manage who can access the app:
- Add users by email
- Set role: **Admin** (sees all locations) or **Lotter** (only their location)
- Assign each lotter their **location** via the dropdown under their row
- Remove users
- **Important:** authorized emails must also be in the `ALLOWED_EMAILS` env var on Vercel — the app is gated at the middleware level

### HQ Upload Queue

The queue of auctions locations have marked "Ready for HQ". Click into any queued auction to push it live via Browser Upload.

### Jobs

View background processing jobs (stock image scans, deep rescans):
- Filter by status: failed / completed / pending
- Retry individual failed jobs
- Retry All Failed button

### Trash

View and restore soft-deleted lots:
- **Restore** brings a lot back to its auction
- **Delete** permanently removes it (irreversible)
- **Empty Trash** purges everything

### Activity Log

See who did what and when:
- Auction creation
- AF uploads
- Lot edits
- Filter by user

### API Costs

Monitor Anthropic API spending:
- Total spent and last 24 hours
- Breakdown by operation (identification, web search, verification)
- Costs are estimates based on token usage

### AF Connection (Settings)

Update the Auction Factory session cookie:
1. Log into AF admin in your browser
2. Open console: Cmd+Option+J
3. Type `document.cookie` and copy the result
4. Paste in Settings and save

**Note:** With Browser Upload, you rarely need to update this anymore. A small red indicator appears in the header if the AF session goes stale.

---

## Troubleshooting

### "Email rate limited" or magic link doesn't arrive
- Supabase's default SMTP caps at ~3-4 emails/hour project-wide
- Use the **"Use password instead"** link on the login page
- If you don't have a password set, ask an admin to set one for you
- Long-term fix: HQ is wiring custom SMTP (Resend)

### Magic link bounces back to login
- Link expired (>1 hour old) — request a new one
- Link already used — each link works once
- "Not authorized" red banner — your email isn't in the `ALLOWED_EMAILS` env var yet, ask HQ

### "AI returned invalid JSON"
- The AI's response had formatting issues
- Just tap **Generate Listing** again — it almost always works on retry

### Photos not loading
- Check your internet connection
- Try closing and reopening the app
- HEIC photos from iPhone are auto-converted but very large ones may take a moment

### Stock images not accurate
- Use **Deep Rescan** on the lot for a more thorough search
- Or manually edit the lot and remove the inaccurate stock image

### AF Upload shows "Forbidden"
- Use **Browser Upload** instead of Server Upload
- This bypasses AF's bot protection entirely

### Lots out of order on AF
- Use **Reset from First Failed Lot** button
- Delete the misaligned lots from AF admin
- Re-upload using Browser Upload

### App crashes / white screen
- The error boundary should show a "Reload App" button
- If not, clear your browser cache and reload
- Errors are automatically reported to Sentry so HQ can see them

### Offline in the warehouse
- The app shows an orange "Offline" banner
- You can still take photos — they'll be saved locally
- When back online, tap "Sync now" to process them

### Location dropdown is empty
- Ask HQ to run the phase-10 migration in Supabase (`phase10_locations.sql`)
- Then have HQ assign you a location in Admin → Users

### I picked the wrong location on first login
- Ask an admin to change it in Admin → Users → your row → location dropdown

---

## Quick Reference

| Action | Where |
|--------|-------|
| Create auction | Auctions page > New Auction |
| Lot an item | Auction > New Lot > photos + condition > Generate |
| Edit a lot | Tap lot > Edit Listing > Save Changes |
| Hand off to HQ | Auction > Mark Ready for HQ |
| Upload to AF (direct) | Auction > Browser Upload > paste script in AF console |
| Find stock images | Auction > Find Stock Images button |
| Deep rescan | Auction > Select > pick lots > Deep Rescan |
| Bulk edit prices | Auction > Select > pick lots > Edit > set multiplier |
| Export data | Auction > stats card > Export to CSV |
| Manage users + locations | Admin > Users |
| View HQ queue | Admin > HQ Upload Queue |
| View costs | Admin > API Costs |
| Restore deleted lot | Admin > Trash > Restore |
| Archive auction | Auctions list > Archive |
| Filter by location | Location dropdown at top of Auctions list |

---

## Contact

For technical issues with the app, contact HQ (Chase Slepak).
For AF admin access or auction setup, contact Chase Slepak.
