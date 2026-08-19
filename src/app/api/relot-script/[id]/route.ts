import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// Serves a paste-into-console JavaScript that reads the lotter's
// canonical numbering and auto-fills every "New Item #" input on AF's
// relot_auction.php page by matching item names. The lotter mapping is
// inlined into the script itself so no cross-origin fetch is needed
// (which avoids CORS + cookie-scope headaches).
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return new NextResponse('// You must be logged into the lotter to generate this script.', {
      status: 401,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return new NextResponse('// Service role key not configured', {
      status: 500,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    });
  }
  const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const [{ data: auction }, { data: lots }] = await Promise.all([
    supabase.from('auctions').select('name').eq('id', params.id).single(),
    supabase
      .from('lots')
      .select('lot_number, item_name')
      .eq('auction_id', params.id)
      .is('deleted_at', null)
      .order('lot_number', { ascending: true }),
  ]);

  if (!auction) {
    return new NextResponse('// Auction not found in lotter', {
      status: 404,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    });
  }

  const mapping = (lots || []).map((l: any) => ({
    n: l.lot_number,
    t: l.item_name || '',
  }));

  const script = `// AF Re-Lot Bulk Fixer — lotter auction: ${auction.name.replace(/[\r\n]/g, ' ').substring(0, 80)}
// Paste on https://auctionfactory.com/admin/relot_auction.php?auction=<id>
(() => {
  const LOTS = ${JSON.stringify(mapping)};

  const existing = document.getElementById('af-relot-status');
  if (existing) existing.remove();
  const ui = document.createElement('div');
  ui.id = 'af-relot-status';
  ui.style.cssText = 'position:fixed;top:16px;right:16px;background:#0A1628;color:white;padding:20px;z-index:999999;border-radius:12px;font-family:-apple-system,sans-serif;font-size:14px;max-width:380px;box-shadow:0 10px 40px rgba(0,0,0,0.4);border:2px solid #5CB82C';
  ui.innerHTML = '<div style="font-weight:bold;margin-bottom:8px">AF Re-Lot Bulk Fixer</div><div id="af-relot-msg">Matching…</div>';
  document.body.appendChild(ui);
  const setMsg = (m) => { document.getElementById('af-relot-msg').innerHTML = m; };

  const normalize = (s) => (s || '').toLowerCase().replace(/\\s+/g, ' ').trim();
  const byName = new Map();
  LOTS.forEach((l) => {
    const key = normalize(l.t);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(l.n);
  });

  const form = document.getElementById('relotForm');
  if (!form) {
    setMsg('ERROR: could not find #relotForm on this page. Are you on relot_auction.php?');
    return;
  }
  const rows = form.querySelectorAll('tbody tr');

  let updated = 0;
  let alreadyCorrect = 0;
  let unmatched = [];
  const cursors = new Map();

  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 3) return;
    const itemName = (cells[0].textContent || '').trim();
    const currentAf = (cells[1].textContent || '').trim();
    const input = row.querySelector('input[name^="newlot"]');
    if (!input) return;

    const key = normalize(itemName);
    const list = byName.get(key) || [];
    const idx = cursors.get(key) || 0;
    const target = list[idx];
    if (target != null) {
      cursors.set(key, idx + 1);
      if (String(input.value) === String(target)) {
        alreadyCorrect++;
      } else {
        input.value = String(target);
        input.style.background = '#fef3c7';
        updated++;
      }
    } else {
      unmatched.push('AF #' + currentAf + ' — ' + itemName.substring(0, 60));
      input.style.background = '#fee2e2';
    }
  });

  let msg = '<b>' + updated + '</b> inputs changed, <b>' + alreadyCorrect + '</b> already correct, <b>' + unmatched.length + '</b> unmatched (' + LOTS.length + ' lotter lots).<br><br>';
  if (unmatched.length > 0) {
    msg += '<div style="max-height:180px;overflow:auto;background:#0f1e33;padding:8px;border-radius:6px;font-size:11px;color:#fca5a5;margin-bottom:8px">Unmatched (red, left alone):<br>' + unmatched.slice(0, 30).join('<br>') + (unmatched.length > 30 ? '<br>… and ' + (unmatched.length - 30) + ' more' : '') + '</div>';
  }
  msg += 'Yellow = updated. Red = no match. Review, then click <b>Save New Lot Numbers</b> at the bottom.';
  setMsg(msg);
})();`;

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
    },
  });
}
