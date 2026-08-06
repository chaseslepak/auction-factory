# Peak Finance HQ

A single-file, no-build personal spending tracker. A **Daily Allowance**
with indefinite rollover, plus category **envelopes** (e.g. a monthly
Groceries or Pet Care budget) with their own optional rollover and the
ability to transfer budget between the Daily Allowance and any category.

Everything lives in one `index.html` — plain vanilla JavaScript, no
framework, no build step. It talks directly to a [Supabase](https://supabase.com)
project's REST API so your data syncs across every device you open it on
(phone, laptop, tablet).

## What's in this folder

- **`index.html`** — the whole app.
- **`schema.sql`** — every table the app needs. Run once on a fresh
  Supabase project.
- **`README.md`** — this file.

## Setup (about 10 minutes, one time)

You'll create a free Supabase project to hold your data, then connect the
app to it. **You do not edit any code** — the app has a built-in setup
screen that asks for your two keys the first time you open it and
remembers them on that device.

### 1. Create a Supabase project
Go to [supabase.com](https://supabase.com), sign up free, and create a new
project. Wait for it to finish provisioning (a minute or two). Pick a
database password you'll keep — you won't need it for this app, but
Supabase requires one.

### 2. Run the schema
In your new project, open the **SQL Editor** (left sidebar), click **New
query**, paste in the entire contents of `schema.sql`, and hit **Run**.
This creates all five tables (`receipts`, `settings`, `categories`,
`category_logs`, `transfers`) with the permissions the app needs.

### 3. Grab your two keys
Go to **Project Settings → API**. You need two values:
- **Project URL** — looks like `https://xxxxxxxx.supabase.co`
- **anon public** key — the long string under "Project API keys" labeled
  `anon` `public`. **Not** the `service_role` key.

### 4. Open the app and connect
Open `index.html` (see [Where to run it](#where-to-run-it) below). The
first time, you'll see a **Connect your database** screen. Paste in your
Project URL and anon key, hit **CONNECT**, and you're in. The keys are
saved in that browser's local storage, so you only do this once per
device.

> Need to change or re-enter the keys later (new phone, wrong paste)? Open
> the **Settings** tab and tap **Change Supabase connection** at the
> bottom.

### 5. Set your daily cap and start logging
On the Dashboard, set your base daily spending cap, then log spends as you
go.

## Where to run it

Because it's one self-contained file, you have options:

- **Just open the file.** Double-click `index.html` — it runs straight
  from your machine and still talks to Supabase in the cloud. Fine for a
  quick try on a computer.
- **GitHub Pages (recommended for phone use).** Host it so you get a real
  URL you can add to your phone's home screen. This project lives in the
  `peak-finance-hq/` subdirectory of the repo, and GitHub Pages serves
  from the repo root or `/docs`, so the simplest route is to copy
  `index.html` (and `schema.sql`) into a **separate repo** of their own,
  then in that repo's **Settings → Pages**, deploy from your main branch
  (root). GitHub gives you a URL like `yourname.github.io/reponame`.
- **Netlify / Vercel / Cloudflare Pages.** Drag-and-drop the folder, or
  point the host at it. Any static host works — there's no server code.

On your phone, open the hosted URL and use "Add to Home Screen" for an
app-like icon and full-screen view.

## How it works, in brief

**Daily Allowance:** set a base daily cap. Whatever you don't spend on a
given day rolls forward indefinitely and stacks onto future days'
effective cap — the **Running Balance** (on the Settings tab) is that
cumulative surplus/deficit, with a **Reset** button to zero it out and
start counting fresh from today.

**Category envelopes:** each category has its own monthly cap and an
optional rollover toggle, managed from the Settings tab. Log a spend
against a category from the Dashboard's log form (the dropdown picks Daily
Allowance or any active category), or backfill a past day's category spend
from the Calendar tab.

**Transfers:** move budget between Daily Allowance and any category (in
either direction) from the Settings tab — handy when a category's about to
run over and you want to cover it from your general allowance, or vice
versa.

## A few things worth knowing before you rely on this

**There's no login.** The anon key sits in your browser and grants
read/write to every table with no per-user isolation. That's fine for a
private single-person tool that only you use; it's **not** suitable if
you'd ever want multiple people keeping separate data in the same project.

**It's a budget tracker, not a bank feed.** It only knows about money you
manually log — it has no idea what's actually happening on any card or
account. "Remaining" here means "allowance left," not "cash on hand."

**Back up occasionally.** There's no built-in export beyond what lives in
your Supabase project. For peace of mind, export table data periodically
from the Supabase dashboard (**Table Editor → each table → Export**).

**Keys are stored per device.** They live in that browser's local storage.
Clearing site data, or opening the app in a different browser/device,
means re-entering them on the setup screen — which is why keeping your two
values somewhere safe is worth it.
