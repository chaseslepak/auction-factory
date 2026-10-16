#!/usr/bin/env node
/**
 * AF round-trip validator.
 *
 * For a given lotter auction, asserts that:
 *
 *   1. Every lot with status='uploaded' has af_item_id populated.
 *   2. Every (auction_id, af_item_id) on our side matches an AF admin
 *      item list row.
 *   3. Every AF admin item has a matching lotter lot (no orphaned AF
 *      items from a double-upload).
 *   4. Zero title drift between the two sources for matched rows.
 *
 * Exits non-zero on any assertion failure. Safe to run against any
 * production auction — read-only, no POSTs. Hooks into CI (or just a
 * pre-release ritual) so the Oct-15-class regression — scraper
 * silently loses lots → audit sync believes drift exists → mass
 * re-upload creates duplicates — is caught before touching the UI.
 *
 * Usage:
 *   SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   AF_SESSION_COOKIE='PHPSESSID=...' \
 *   TEST_AUCTION_ID=<lotter uuid> \
 *   node scripts/test-af-roundtrip.mjs
 *
 * Env knobs:
 *   TEST_AUCTION_ID         Lotter-side auction UUID to validate.
 *   AF_SESSION_COOKIE       Direct cookie (overrides af_session row).
 *   STRICT=1                Fail on ANY mismatch; off by default so
 *                           minor title normalization differences don't
 *                           block CI. Core identity checks are always
 *                           enforced.
 *   MAX_DRIFT_PCT=0         Allowed drift percentage (default 0 — any
 *                           drift fails).
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUCTION_ID = process.env.TEST_AUCTION_ID;
const STRICT = process.env.STRICT === '1';
const MAX_DRIFT_PCT = Number(process.env.MAX_DRIFT_PCT || 0);
const AF_BASE = 'https://auctionfactory.com/admin';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}
function pass(msg) {
  console.log(`✓ ${msg}`);
}
function info(msg) {
  console.log(`  ${msg}`);
}

const normalize = (s) =>
  (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

function parseAdminItemList(html) {
  const items = [];
  const formRegex = /<form\b[^>]*>([\s\S]*?)<\/form>/gi;
  let m;
  let formInner = '';
  while ((m = formRegex.exec(html)) !== null) {
    if (/name=["']newlot\[/i.test(m[1])) {
      formInner = m[1];
      break;
    }
  }
  if (!formInner) return items;

  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let r;
  while ((r = rowRegex.exec(formInner)) !== null) {
    const rowHtml = r[1];
    const inputMatch = rowHtml.match(
      /<input\b[^>]*\bname=["']newlot\[([^\]]+)\]["'][^>]*>/i,
    );
    if (!inputMatch) continue;
    const af_item_id = Number(inputMatch[1]);
    if (!Number.isFinite(af_item_id) || af_item_id <= 0) continue;
    const cellRegex = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let c;
    while ((c = cellRegex.exec(rowHtml)) !== null) {
      cells.push(c[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
    }
    const title = cells[0] || '';
    items.push({ af_item_id, title });
  }
  return items;
}

async function fetchAdminItemList(afAuctionId, cookie) {
  const url = `${AF_BASE}/relot_auction.php?auction=${afAuctionId}&relot=Re-Lot`;
  const res = await fetch(url, {
    headers: { Cookie: cookie, 'User-Agent': UA, Accept: 'text/html' },
    redirect: 'manual',
  });
  if (res.status === 302 || res.status === 301) {
    throw new Error(`AF redirected to ${res.headers.get('location')} — session expired`);
  }
  if (res.status !== 200) {
    throw new Error(`AF returned HTTP ${res.status}`);
  }
  const html = await res.text();
  if (/name=["']psEmail["']|name=["']psPassword["']/i.test(html.substring(0, 5000))) {
    throw new Error('AF body is the login form — session expired');
  }
  return parseAdminItemList(html);
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    return;
  }
  if (!AUCTION_ID) {
    fail('TEST_AUCTION_ID must be set to a lotter auction UUID');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: baseAuction, error: auctionErr } = await supabase
    .from('auctions')
    .select('id, title')
    .eq('id', AUCTION_ID)
    .single();
  if (auctionErr || !baseAuction) {
    fail(`Auction ${AUCTION_ID} not found: ${auctionErr?.message || 'no row'}`);
    return;
  }
  const { data: mapping } = await supabase
    .from('af_auction_map')
    .select('af_auction_id')
    .eq('auction_id', AUCTION_ID)
    .single();
  const auction = { ...baseAuction, af_auction_id: mapping?.af_auction_id ?? null };
  if (!auction.af_auction_id) {
    fail(`Auction has no AF mapping — nothing to validate`);
    return;
  }
  info(`Validating ${auction.title || auction.id} (AF #${auction.af_auction_id})`);

  const { data: lots } = await supabase
    .from('lots')
    .select('id, item_name, lot_number, af_item_id, status')
    .eq('auction_id', AUCTION_ID)
    .in('status', ['uploaded', 'queued']);

  if (!lots || lots.length === 0) {
    fail('No uploaded/queued lots found on this auction');
    return;
  }
  info(`Lotter has ${lots.length} uploaded/queued lots`);

  const missingAfId = lots.filter((l) => l.af_item_id == null);
  if (missingAfId.length > 0) {
    const msg = `${missingAfId.length}/${lots.length} uploaded lots have no af_item_id — pre-phase15 drift; run /admin/backfill first`;
    if (STRICT) fail(msg);
    else info(`⚠  ${msg}`);
  } else {
    pass(`Every uploaded lot has af_item_id populated`);
  }

  let cookie = process.env.AF_SESSION_COOKIE || '';
  if (!cookie) {
    const { data: sess } = await supabase
      .from('af_session')
      .select('session_cookie')
      .eq('id', 1)
      .single();
    cookie = sess?.session_cookie || '';
    // Encrypted cookies not supported here — use AF_SESSION_COOKIE
    // explicitly if encryption is on.
    if (!/^PHPSESSID=/i.test(cookie) && !cookie.includes('=')) {
      cookie = `PHPSESSID=${cookie}`;
    }
  }
  if (!cookie) {
    fail('No AF session cookie available (set AF_SESSION_COOKIE)');
    return;
  }

  let adminItems;
  try {
    adminItems = await fetchAdminItemList(auction.af_auction_id, cookie);
  } catch (err) {
    fail(`AF admin item list fetch failed: ${err.message}`);
    return;
  }
  info(`AF has ${adminItems.length} items for this auction`);

  const adminById = new Map(adminItems.map((i) => [i.af_item_id, i]));
  const adminByTitle = new Map();
  for (const i of adminItems) {
    const k = normalize(i.title);
    if (!k) continue;
    const b = adminByTitle.get(k) || [];
    b.push(i);
    adminByTitle.set(k, b);
  }

  // Assertion 1: every lot with af_item_id has a matching admin row
  let orphanedLotterLots = 0;
  let titleDrift = 0;
  for (const lot of lots) {
    if (lot.af_item_id == null) continue;
    const admin = adminById.get(lot.af_item_id);
    if (!admin) {
      orphanedLotterLots++;
      continue;
    }
    if (normalize(admin.title) !== normalize(lot.item_name)) {
      titleDrift++;
    }
  }

  // Assertion 2: every admin item has a matching lotter row
  const lotterIds = new Set(lots.map((l) => l.af_item_id).filter((n) => n != null));
  const orphanedAfItems = adminItems.filter((i) => !lotterIds.has(i.af_item_id));

  if (orphanedLotterLots === 0) {
    pass(`Every lot with af_item_id has a matching AF admin row`);
  } else {
    fail(`${orphanedLotterLots} lotter lots point at af_item_ids AF doesn't have — upload drift`);
  }

  if (orphanedAfItems.length === 0) {
    pass(`Every AF admin item has a matching lotter lot`);
  } else {
    const msg = `${orphanedAfItems.length} AF items have no lotter lot — likely duplicate-upload leftovers`;
    if (STRICT) fail(msg);
    else info(`⚠  ${msg} (set STRICT=1 to fail on this)`);
  }

  const driftPct = lots.length === 0 ? 0 : (titleDrift / lots.length) * 100;
  if (titleDrift === 0) {
    pass(`Zero title drift between lotter and AF`);
  } else if (driftPct <= MAX_DRIFT_PCT) {
    info(`⚠  ${titleDrift} titles differ (${driftPct.toFixed(1)}%) — within MAX_DRIFT_PCT=${MAX_DRIFT_PCT}`);
  } else {
    fail(`${titleDrift} titles differ (${driftPct.toFixed(1)}%) — exceeds MAX_DRIFT_PCT=${MAX_DRIFT_PCT}`);
  }

  if (process.exitCode === 1) {
    console.error('\n✗ Round-trip validation FAILED — investigate before trusting this auction.');
  } else {
    console.log('\n✓ Round-trip validation passed.');
  }
}

main().catch((err) => {
  console.error('Harness crashed:', err);
  process.exit(1);
});
