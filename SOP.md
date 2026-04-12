# Ohio Lotter — Internal SOP & Instruction Manual

**Auction Factory Ohio | Standard Operating Procedure**
**Version:** 1.0 | **Last Updated:** April 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Creating an Auction](#creating-an-auction)
4. [Lotting Items](#lotting-items)
5. [Reviewing & Editing Lots](#reviewing--editing-lots)
6. [Stock Images & Pricing](#stock-images--pricing)
7. [Uploading to Auction Factory](#uploading-to-auction-factory)
8. [Managing Your Auction](#managing-your-auction)
9. [Admin Panel](#admin-panel)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The Ohio Lotter is a mobile-first web app that lets warehouse staff photograph restaurant equipment and instantly generate professional auction listings using AI. Listings are then uploaded directly to the Auction Factory backend.

**App URL:** https://auction-factory.vercel.app

**What it does:**
- Snap photos of equipment from your phone
- AI identifies the item, writes the description, finds retail pricing
- Upload listings directly to Auction Factory with one click
- Works on iPhone, Android, or desktop

---

## Getting Started

### First-Time Login

1. Open **auction-factory.vercel.app** on your phone or computer
2. Enter your authorized email address
3. Tap **Send Magic Link**
4. Check your email for the login link
5. Click the link — you'll be signed in automatically

**Note:** Magic links expire after 1 hour. If it doesn't work, request a new one.

### Installing on Your Phone (Optional)

**iPhone:**
1. Open the app in Safari
2. Tap the Share button (square with arrow)
3. Tap **Add to Home Screen**
4. Name it "Ohio Lotter" and tap Add

**Android:**
1. Open the app in Chrome
2. Tap the three-dot menu
3. Tap **Install App** or **Add to Home Screen**

---

## Creating an Auction

1. From the **Auctions** page, tap **New Auction**
2. Enter the auction name (e.g., "Ohio - T&M #3")
3. Tap **Create**
4. Your new auction appears in the list — tap it to start lotting

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
1. Searches WebstaurantStore for the exact brand+model
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

### First Time: Link Your AF Auction

1. In the auction detail page, tap **Link AF Auction for Upload**
2. Select your auction from the dropdown (fetched from AF admin)
3. Tap **Link**

### Browser Upload (Recommended)

This is the most reliable method. It runs from your browser.

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

Access via **Admin** link on the auctions list page.

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

### Users

Manage who can access the app:
- Add users by email
- Set role: **Admin** (full access) or **Lotter** (can lot and upload)
- Remove users
- Note: also need to add to ALLOWED_EMAILS env var on Vercel

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

**Note:** With Browser Upload, you rarely need to update this anymore.

---

## Troubleshooting

### "Send Magic Link" not working
- Wait 10-15 minutes (Supabase rate limits to ~3-4 per hour)
- Check spam folder
- Make sure your email is in the authorized list

### Magic link bounces back to login
- Link expired (>1 hour old) — request a new one
- Link already used — each link works once

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

### Offline in the warehouse
- The app shows an orange "Offline" banner
- You can still take photos — they'll be saved locally
- When back online, tap "Sync now" to process them

---

## Quick Reference

| Action | Where |
|--------|-------|
| Create auction | Auctions page > New Auction |
| Lot an item | Auction > New Lot > photos + condition > Generate |
| Edit a lot | Tap lot > Edit Listing > Save Changes |
| Upload to AF | Auction > Browser Upload > paste script in AF console |
| Find stock images | Auction > Find Stock Images button |
| Deep rescan | Auction > Select > pick lots > Deep Rescan |
| Bulk edit prices | Auction > Select > pick lots > Edit > set multiplier |
| Export data | Auction > stats card > Export to CSV |
| Manage users | Admin > Users |
| View costs | Admin > API Costs |
| Restore deleted lot | Admin > Trash > Restore |
| Archive auction | Auctions list > Archive |

---

## Contact

For technical issues with the app, contact the development team.
For AF admin access or auction setup, contact Chase Slepak.
