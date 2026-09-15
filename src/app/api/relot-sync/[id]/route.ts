import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const AF_BASE = 'https://www.auctionfactory.com/admin';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const normalize = (s: string) =>
  (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

interface RelotRow {
  af_item_id: string;
  title: string;
  current_lot: string;
}

interface RelotForm {
  action: string;
  hiddenFields: Record<string, string>;
  submitName: string;
  submitValue: string;
  rows: RelotRow[];
}

// Parse AF's relot_auction.php HTML into: form action, hidden fields,
// submit button, and one row per newlot[] input. Structural parsing —
// no id/class dependence, so a form rename doesn't break us.
function parseRelotForm(html: string): RelotForm | null {
  // Find the <form> that wraps the newlot inputs. Structural signature:
  // form contains at least one input[name^="newlot"].
  const formRegex = /<form\b[^>]*>([\s\S]*?)<\/form>/gi;
  let match: RegExpExecArray | null;
  let formOpenTag = '';
  let formInner = '';
  while ((match = formRegex.exec(html)) !== null) {
    if (/name=["']newlot\[/i.test(match[1])) {
      formOpenTag = match[0].split('>')[0] + '>';
      formInner = match[1];
      break;
    }
  }
  if (!formInner) return null;

  // Extract form action (fallback: relot_auction.php itself)
  const actionMatch = formOpenTag.match(/\baction=["']([^"']*)["']/i);
  const action = actionMatch ? actionMatch[1] : '';

  // Hidden fields (name -> value)
  const hiddenFields: Record<string, string> = {};
  const hiddenRegex =
    /<input\b[^>]*\btype=["']hidden["'][^>]*>/gi;
  const inputAttrRegex = /(\w+)=["']([^"']*)["']/g;
  let h: RegExpExecArray | null;
  while ((h = hiddenRegex.exec(formInner)) !== null) {
    const tag = h[0];
    const attrs: Record<string, string> = {};
    let a: RegExpExecArray | null;
    inputAttrRegex.lastIndex = 0;
    while ((a = inputAttrRegex.exec(tag)) !== null) {
      attrs[a[1].toLowerCase()] = a[2];
    }
    if (attrs.name && !/^newlot\[/i.test(attrs.name)) {
      hiddenFields[attrs.name] = attrs.value ?? '';
    }
  }

  // Submit button (name + value). AF's Save button is usually
  // <input type="submit" name="submit" value="Save New Lot Numbers">
  // — capture whatever name/value it has so we can send it in the POST.
  let submitName = 'submit';
  let submitValue = 'Save New Lot Numbers';
  const submitMatch = formInner.match(
    /<input\b[^>]*\btype=["']submit["'][^>]*>/i
  );
  if (submitMatch) {
    const tag = submitMatch[0];
    const nameM = tag.match(/\bname=["']([^"']*)["']/i);
    const valM = tag.match(/\bvalue=["']([^"']*)["']/i);
    if (nameM) submitName = nameM[1];
    if (valM) submitValue = valM[1];
  }

  // Rows: one per newlot[<af_item_id>] input, with the row's title
  // (usually first td) and current lot value (the input's value).
  const rows: RelotRow[] = [];
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let r: RegExpExecArray | null;
  while ((r = rowRegex.exec(formInner)) !== null) {
    const rowHtml = r[1];
    const inputMatch = rowHtml.match(
      /<input\b[^>]*\bname=["']newlot\[([^\]]+)\]["'][^>]*>/i
    );
    if (!inputMatch) continue;
    const af_item_id = inputMatch[1];
    const currentValM = inputMatch[0].match(/\bvalue=["']([^"']*)["']/i);
    const current_lot = currentValM ? currentValM[1] : '';

    // Grab the row's first-cell text as the title (strip tags).
    const cellRegex = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let c: RegExpExecArray | null;
    while ((c = cellRegex.exec(rowHtml)) !== null) {
      const text = c[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      cells.push(text);
    }
    // First cell is typically item name.
    const title = cells[0] || '';
    rows.push({ af_item_id, title, current_lot });
  }

  return { action, hiddenFields, submitName, submitValue, rows };
}

async function decryptCookie(raw: string): Promise<string> {
  try {
    const { decrypt } = await import('@/lib/crypto');
    return decrypt(raw);
  } catch {
    return raw;
  }
}

// POST /api/relot-sync/[id]?dry_run=1  — preview only, don't POST to AF
// POST /api/relot-sync/[id]            — actually push new numbers to AF
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get('dry_run') === '1';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'Service role key not configured' },
      { status: 500 }
    );
  }
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  );

  // Look up AF auction id + AF session cookie in parallel.
  const [{ data: mapping }, { data: session }, { data: lots }] = await Promise.all([
    supabase
      .from('af_auction_map')
      .select('af_auction_id')
      .eq('auction_id', params.id)
      .single(),
    supabase.from('af_session').select('session_cookie').eq('id', 1).single(),
    supabase
      .from('lots')
      .select('lot_number, item_name')
      .eq('auction_id', params.id)
      .is('deleted_at', null)
      .order('lot_number', { ascending: true }),
  ]);

  if (!mapping?.af_auction_id) {
    return NextResponse.json(
      { error: 'No AF auction linked. Link one first.' },
      { status: 400 }
    );
  }
  if (!session?.session_cookie) {
    return NextResponse.json(
      { error: 'No AF session. Connect your AF account in Settings first.' },
      { status: 400 }
    );
  }
  if (!lots?.length) {
    return NextResponse.json(
      { error: 'No lots in this auction.' },
      { status: 400 }
    );
  }

  const cookie = await decryptCookie(session.session_cookie);
  const relotUrl = `${AF_BASE}/relot_auction.php?auction=${mapping.af_auction_id}&relot=Re-Lot`;

  // 1) GET the relot page with the AF session cookie.
  const getRes = await fetch(relotUrl, {
    headers: {
      Cookie: cookie,
      'User-Agent': BROWSER_UA,
      Accept: 'text/html',
    },
    redirect: 'manual',
  });
  if (getRes.status !== 200) {
    if (getRes.status === 302 || getRes.status === 301) {
      return NextResponse.json(
        { error: `AF session expired (${getRes.status} redirect). Reconnect AF in Settings.` },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: `AF relot page returned HTTP ${getRes.status}.` },
      { status: 502 }
    );
  }
  const html = await getRes.text();
  if (/psEmail|psPassword/.test(html.substring(0, 5000))) {
    return NextResponse.json(
      { error: 'AF session expired. Reconnect AF in Settings.' },
      { status: 401 }
    );
  }

  const form = parseRelotForm(html);
  if (!form || form.rows.length === 0) {
    return NextResponse.json(
      {
        error:
          "Couldn't parse AF's relot form. AF may have changed the page structure — send this URL to Chase to inspect: " +
          relotUrl,
      },
      { status: 502 }
    );
  }

  // 2) Match each AF row to a lotter lot by normalized name.
  const byName = new Map<string, number[]>();
  for (const l of lots) {
    const key = normalize(l.item_name || '');
    const arr = byName.get(key) || [];
    arr.push(l.lot_number);
    byName.set(key, arr);
  }

  const cursors = new Map<string, number>();
  const plan: Array<{
    af_item_id: string;
    title: string;
    current_lot: string;
    target_lot: number | null;
    status: 'change' | 'same' | 'unmatched';
  }> = [];

  for (const row of form.rows) {
    const key = normalize(row.title);
    const options = byName.get(key) || [];
    const idx = cursors.get(key) || 0;
    const target = options[idx] ?? null;
    if (target != null) {
      cursors.set(key, idx + 1);
      plan.push({
        af_item_id: row.af_item_id,
        title: row.title,
        current_lot: row.current_lot,
        target_lot: target,
        status: String(row.current_lot) === String(target) ? 'same' : 'change',
      });
    } else {
      plan.push({
        af_item_id: row.af_item_id,
        title: row.title,
        current_lot: row.current_lot,
        target_lot: null,
        status: 'unmatched',
      });
    }
  }

  const willChange = plan.filter((p) => p.status === 'change').length;
  const alreadyCorrect = plan.filter((p) => p.status === 'same').length;
  const unmatched = plan.filter((p) => p.status === 'unmatched');

  const summary = {
    af_relot_url: relotUrl,
    total_af_rows: form.rows.length,
    total_lotter_lots: lots.length,
    will_change: willChange,
    already_correct: alreadyCorrect,
    unmatched: unmatched.length,
    unmatched_examples: unmatched.slice(0, 10).map((u) => ({
      af_item_id: u.af_item_id,
      title: u.title.substring(0, 80),
      current_lot: u.current_lot,
    })),
  };

  if (dryRun) {
    return NextResponse.json({ dryRun: true, ...summary });
  }

  if (willChange === 0) {
    return NextResponse.json({
      dryRun: false,
      posted: false,
      message: 'No changes needed — AF already matches lotter.',
      ...summary,
    });
  }

  // 3) POST the fixed values back. Include every newlot[] input (unchanged
  // ones too — safer, mirrors what the browser Save does) plus hidden
  // fields and the submit button.
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(form.hiddenFields)) {
    body.append(k, v);
  }
  for (const p of plan) {
    // For unmatched rows, keep the current value so we don't blank them out.
    const value =
      p.status === 'unmatched' ? p.current_lot : String(p.target_lot);
    body.append(`newlot[${p.af_item_id}]`, value);
  }
  body.append(form.submitName, form.submitValue);

  const actionUrl = form.action
    ? new URL(form.action, relotUrl).toString()
    : relotUrl;

  const postRes = await fetch(actionUrl, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': BROWSER_UA,
      Accept: 'text/html',
      Referer: relotUrl,
      Origin: 'https://www.auctionfactory.com',
    },
    body: body.toString(),
    redirect: 'manual',
  });

  const postText = await postRes.text();
  const postSnippet = postText.substring(0, 500);

  const success =
    postRes.status === 200 ||
    postRes.status === 302 ||
    postRes.status === 303;

  if (!success) {
    return NextResponse.json(
      {
        dryRun: false,
        posted: true,
        ok: false,
        error: `AF POST returned HTTP ${postRes.status}`,
        af_snippet: postSnippet,
        ...summary,
      },
      { status: 502 }
    );
  }

  // Best-effort activity log — non-fatal.
  try {
    await supabase.from('activity_log').insert({
      user_email: user.email || 'unknown',
      action: 'relot_synced',
      entity_type: 'auction',
      auction_id: params.id,
      details: {
        will_change: willChange,
        already_correct: alreadyCorrect,
        unmatched: unmatched.length,
      },
    });
  } catch {}

  return NextResponse.json({
    dryRun: false,
    posted: true,
    ok: true,
    ...summary,
    message: `Renumbered ${willChange} lot(s) on AF. Re-run audit to verify.`,
  });
}
