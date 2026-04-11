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
    // Decrypt cookie if encrypted
    let cookie = session.session_cookie;
    try {
      const { decrypt } = await import('@/lib/crypto');
      cookie = decrypt(cookie);
    } catch {}

    // Fetch the add_item page which has the auction dropdown
    const res = await fetch(`${AF_BASE}/add_item.php`, {
      headers: { Cookie: cookie },
      redirect: 'manual',
    });

    if (res.status === 302) {
      return NextResponse.json({ error: 'AF session expired' }, { status: 401 });
    }

    const html = await res.text();

    // Parse auction dropdown: <option value="4805">Ohio - T&M #2</option>
    const auctions: { id: string; name: string }[] = [];
    const regex = /<option value="(\d+)">([^<]+)<\/option>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      auctions.push({ id: match[1], name: match[2].trim() });
    }

    return NextResponse.json({ auctions });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
