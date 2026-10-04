import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const AF_BASE = 'https://www.auctionfactory.com';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Walks the AF admin pages the lotter cares about, parses what AF is
// currently serving, and returns a report Chase can paste to me so we
// can diff against what the lotter expects.
//
// Usage: GET /api/admin/af-diagnostic?auction=<AF_ID>
//        (auction defaults to the first linked AF auction in the DB)

interface FormReport {
  action: string;
  method: string;
  id: string;
  name: string;
  input_count: number;
  text_inputs: Array<{ name: string; value?: string }>;
  hidden_inputs: Array<{ name: string; value?: string }>;
  selects: Array<{ name: string; options: number }>;
  textareas: Array<{ name: string }>;
  file_inputs: Array<{ name: string }>;
  submits: Array<{ name: string; value?: string }>;
  newlot_count: number;
}

interface PageReport {
  url: string;
  http_status: number;
  redirected_to: string | null;
  content_length: number;
  title: string;
  looks_like_login: boolean;
  looks_like_error: boolean;
  forms: FormReport[];
  body_first_2000: string;
}

function matchAll(html: string, re: RegExp): string[] {
  const out: string[] = [];
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = r.exec(html)) !== null) out.push(m[0]);
  return out;
}

function extractAttr(tag: string, attr: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${attr}=["']([^"']*)["']`, 'i'));
  return m ? m[1] : undefined;
}

function reportForm(formHtml: string, openTag: string): FormReport {
  const action = extractAttr(openTag, 'action') ?? '';
  const method = (extractAttr(openTag, 'method') ?? 'GET').toUpperCase();
  const id = extractAttr(openTag, 'id') ?? '';
  const name = extractAttr(openTag, 'name') ?? '';

  const inputs = matchAll(formHtml, /<input\b[^>]*>/gi);
  const textareas = matchAll(formHtml, /<textarea\b[^>]*>/gi);
  const selects = matchAll(formHtml, /<select\b[^>]*>[\s\S]*?<\/select>/gi);

  const text_inputs: FormReport['text_inputs'] = [];
  const hidden_inputs: FormReport['hidden_inputs'] = [];
  const file_inputs: FormReport['file_inputs'] = [];
  const submits: FormReport['submits'] = [];
  let newlot_count = 0;

  for (const tag of inputs) {
    const nm = extractAttr(tag, 'name');
    if (!nm) continue;
    const type = (extractAttr(tag, 'type') ?? 'text').toLowerCase();
    const value = extractAttr(tag, 'value');
    if (/^newlot\[/i.test(nm)) {
      newlot_count++;
      continue;
    }
    if (type === 'hidden') hidden_inputs.push({ name: nm, value });
    else if (type === 'submit' || type === 'image' || type === 'button')
      submits.push({ name: nm, value });
    else if (type === 'file') file_inputs.push({ name: nm });
    else text_inputs.push({ name: nm, value });
  }

  const sel: FormReport['selects'] = [];
  for (const s of selects) {
    const nm = extractAttr(s, 'name');
    if (!nm) continue;
    const opts = matchAll(s, /<option\b[^>]*>/gi).length;
    sel.push({ name: nm, options: opts });
  }

  const ta: FormReport['textareas'] = [];
  for (const t of textareas) {
    const nm = extractAttr(t, 'name');
    if (nm) ta.push({ name: nm });
  }

  return {
    action,
    method,
    id,
    name,
    input_count: inputs.length,
    text_inputs,
    hidden_inputs,
    selects: sel,
    textareas: ta,
    file_inputs,
    submits,
    newlot_count,
  };
}

function reportPage(url: string, status: number, html: string, redirectedTo: string | null): PageReport {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
  const looks_like_login = /name=["']psEmail["']|name=["']psPassword["']/i.test(html);
  const looks_like_error = /not\s+found|access\s+denied|unauthoriz|forbidden/i.test(html);

  const forms: FormReport[] = [];
  const formRegex = /<form\b[^>]*>([\s\S]*?)<\/form>/gi;
  let m: RegExpExecArray | null;
  while ((m = formRegex.exec(html)) !== null) {
    const openTag = m[0].split('>')[0] + '>';
    forms.push(reportForm(m[1], openTag));
  }

  return {
    url,
    http_status: status,
    redirected_to: redirectedTo,
    content_length: html.length,
    title,
    looks_like_login,
    looks_like_error,
    forms,
    body_first_2000: html.substring(0, 2000),
  };
}

export async function GET(request: NextRequest) {
  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }
  const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  // Pull the stored AF session cookie.
  const { data: session } = await supabase
    .from('af_session')
    .select('session_cookie')
    .eq('id', 1)
    .single();
  if (!session?.session_cookie) {
    return NextResponse.json(
      { error: 'No AF session cookie stored. Connect your AF account in Settings first.' },
      { status: 400 }
    );
  }
  let cookie = session.session_cookie;
  try {
    const { decrypt } = await import('@/lib/crypto');
    cookie = decrypt(cookie);
  } catch {}

  // Pick an auction id — url param wins, otherwise take the first mapped one.
  const auctionParam = request.nextUrl.searchParams.get('auction');
  let afAuctionId = auctionParam;
  if (!afAuctionId) {
    const { data: anyMap } = await supabase
      .from('af_auction_map')
      .select('af_auction_id')
      .limit(1)
      .maybeSingle();
    afAuctionId = anyMap?.af_auction_id ?? null;
  }

  // Pages we care about. Hit the main three — all of these are what the
  // lotter either POSTs to or scrapes. Add more here if we need visibility
  // into other admin flows later.
  const urls: string[] = [`${AF_BASE}/admin/`];
  if (afAuctionId) {
    urls.push(`${AF_BASE}/admin/add_item_2new.php?auction=${afAuctionId}`);
    urls.push(`${AF_BASE}/admin/relot_auction.php?auction=${afAuctionId}&relot=Re-Lot`);
    urls.push(`${AF_BASE}/admin/auction_details.php?auction=${afAuctionId}`);
  }

  const results: PageReport[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          Cookie: cookie,
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'manual',
      });
      const redirectedTo = res.status >= 300 && res.status < 400
        ? res.headers.get('location')
        : null;
      const html = await res.text();
      results.push(reportPage(url, res.status, html, redirectedTo));
    } catch (err: any) {
      results.push({
        url,
        http_status: 0,
        redirected_to: null,
        content_length: 0,
        title: '',
        looks_like_login: false,
        looks_like_error: true,
        forms: [],
        body_first_2000: `FETCH_ERROR: ${err?.message || err}`,
      });
    }
  }

  // What the lotter CURRENTLY expects. Diffing happens visually when I
  // read your report — I just need to see what AF is serving today.
  const lotter_expects = {
    add_item_2new: {
      hidden_fields: ['auction', 'auction_id', 'end_date', 'end_time', 'auto_extend', 'staggered'],
      text_inputs: ['title', 'name', 'make', 'model', 'qty', 'original_price', 'start', 'reserve', 'buyitnow', 'width', 'depth', 'height', 'youtube'],
      select_name: 'condition',
      file_input: 'file[]',
      submits: ['next (Next Item)', 'exit (Save & Exit)'],
      session_markers: ['name="auction"', 'name="title"', 'name="original_price"', 'name="condition"', 'add_item_2new'],
      session_login_markers: ['name="psEmail"', 'name="psPassword"'],
    },
    relot_auction: {
      newlot_pattern: 'input[name^="newlot["]',
      submit: 'Save New Lot Numbers',
    },
    scraper_item_detail_url: 'https://www.auctionfactory.com/item_detail.php?item=<id>',
  };

  return NextResponse.json({
    cookie_preview: cookie.substring(0, 40) + '...',
    auction_id_used: afAuctionId,
    lotter_expects,
    af_actual: results,
  });
}
