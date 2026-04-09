import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const AF_BASE = 'https://www.auctionfactory.com/admin';

// Fetch list of auctions from AF admin
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get AF session
  const { data: session } = await supabase
    .from('af_session')
    .select('session_cookie')
    .eq('id', 1)
    .single();

  if (!session?.session_cookie) {
    return NextResponse.json({ error: 'Not connected to AF' }, { status: 400 });
  }

  try {
    const res = await fetch(`${AF_BASE}/auctions.php`, {
      headers: { Cookie: session.session_cookie },
      redirect: 'manual',
    });

    if (res.status === 302) {
      return NextResponse.json({ error: 'AF session expired' }, { status: 401 });
    }

    const html = await res.text();

    // Parse auction list from HTML
    // AF auctions page typically has links like: add_item.php?auction_id=123
    // or auction rows with IDs
    const auctions: { id: string; name: string }[] = [];
    const regex = /auction_id=(\d+)[^>]*>([^<]*)</gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      auctions.push({ id: match[1], name: match[2].trim() });
    }

    // Also try to find auction names in table rows
    // Pattern: links containing auction names with IDs
    if (auctions.length === 0) {
      // Try alternative pattern - look for any numbered links
      const altRegex = /href="[^"]*?(\d{4,})[^"]*"[^>]*>([^<]+)</gi;
      while ((match = altRegex.exec(html)) !== null) {
        const name = match[2].trim();
        if (name && !name.includes('http') && name.length > 2) {
          auctions.push({ id: match[1], name });
        }
      }
    }

    return NextResponse.json({ auctions, raw_length: html.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
