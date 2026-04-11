# Browser Upload — The Fix

The long-term solution is deployed. Instead of Vercel sending upload requests to AF (which gets blocked by mod_security), the uploads now run **from your own browser** using your real AF session.

## Setup (one-time)

### 1. Run the SQL migration in Supabase

```sql
create table if not exists public.upload_tokens (
  token text primary key,
  auction_id uuid references public.auctions(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists idx_upload_tokens_auction on public.upload_tokens(auction_id);
create index if not exists idx_upload_tokens_expires on public.upload_tokens(expires_at);
alter table public.upload_tokens enable row level security;
drop policy if exists "auth_select_upload_tokens" on public.upload_tokens;
drop policy if exists "auth_insert_upload_tokens" on public.upload_tokens;
drop policy if exists "auth_delete_upload_tokens" on public.upload_tokens;
create policy "auth_select_upload_tokens" on public.upload_tokens for select to authenticated using (true);
create policy "auth_insert_upload_tokens" on public.upload_tokens for insert to authenticated with check (true);
create policy "auth_delete_upload_tokens" on public.upload_tokens for delete to authenticated using (true);
```

### 2. Wait for Vercel deploy
Check Vercel dashboard — latest deploy should say "Browser Upload: run uploads from user's real AF browser session".

## Using it

### Every upload:

1. **Open AF admin** in Chrome: go to `auctionfactory.com/admin` and log in. Navigate to any page inside /admin (e.g. auctions.php).
2. **Open browser console** in the AF tab: press **Cmd+Option+J** (Mac) or **F12** (Windows).
3. **Go to your lotter app** in another tab: open the auction, click **"🌐 Browser Upload (recommended)"** (the new green button).
4. **Click "Generate Script"** — you'll get a short loader script.
5. **Click "Copy Script"**.
6. **Switch back to AF tab**, paste the script into the console, press **Enter**.
7. **A status window appears** in the top-right of AF showing progress.
8. **Leave the AF tab open** until it shows DONE. You can switch tabs but don't close AF.

### What happens under the hood:
- The loader fetches the full upload script from our server (stays in sync with latest code).
- Script reads AF's form fields (same as a real user visiting add_item_2new.php).
- Script fetches your lot data from our app via the time-limited token.
- For each lot: downloads photos, builds a FormData like the real form would, POSTs to AF using your real cookies and session.
- Every request looks identical to you manually submitting the form in AF admin — mod_security has nothing to flag.
- Each lot updates its status in the lotter so you can track progress.

### Why it works:
- **Same-origin**: requests go from auctionfactory.com to auctionfactory.com (no cross-origin issues)
- **Real cookies**: uses your logged-in session, no cookie copying
- **Real user-agent**: your actual Chrome user-agent, not a data center IP
- **Natural pacing**: 1-second delays between uploads (adjustable in the script)
- **Real headers**: all the headers a real browser sends automatically

## Expected behavior

- Near-100% success rate
- Placeholder-free (no mod_security blocks)
- Lots stay in correct order
- No more deleting and re-uploading
- Token expires after 24 hours — generate a new one if needed

## Fallback
The old "Server Upload (fallback)" button still exists if you need it, but you shouldn't.

## Troubleshooting

**"Could not read AF form. Are you logged in?"**
→ You're not logged into AF admin in the tab where you pasted the script. Log in to auctionfactory.com/admin first.

**"ERROR: Invalid or expired token"**
→ Token is older than 24 hours. Generate a new one.

**Some lots still fail**
→ Open browser console in the AF tab to see the actual error. Paste it here and we'll fix.

**Status window disappeared**
→ The script completed or crashed. Check the browser console for errors.
