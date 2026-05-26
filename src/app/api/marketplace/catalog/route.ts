import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { htmlToText, type StorefrontProduct } from '@/lib/marketplace';

const STORE_URL = (process.env.MARKETPLACE_STORE_URL || 'https://crazygoodbuy.com').replace(/\/$/, '');
const MAX_PAGES = 10; // up to 2500 products
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const maxDuration = 60;

export async function GET(_request: NextRequest) {
  // Auth: only signed-in team members.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const products: StorefrontProduct[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(
        `${STORE_URL}/products.json?limit=250&page=${page}`,
        { headers: { 'User-Agent': UA } }
      );
      if (!res.ok) break;
      const data = await res.json();
      const batch = data.products || [];
      if (batch.length === 0) break;

      for (const p of batch) {
        const variant = (p.variants || [])[0] || {};
        products.push({
          id: String(p.id),
          handle: p.handle,
          title: p.title || '',
          descriptionText: htmlToText(p.body_html || ''),
          productType: p.product_type || '',
          tags: Array.isArray(p.tags)
            ? p.tags
            : String(p.tags || '')
                .split(',')
                .map((t: string) => t.trim())
                .filter(Boolean),
          price: Number(variant.price) || 0,
          sku: variant.sku || '',
          stockImages: (p.images || []).map((img: any) => img.src).filter(Boolean),
        });
      }

      if (batch.length < 250) break;
    }

    return NextResponse.json({ products, storeUrl: STORE_URL });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch catalog' },
      { status: 500 }
    );
  }
}
