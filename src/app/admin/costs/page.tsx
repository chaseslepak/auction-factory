'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Header from '@/components/Header';

interface UsageRow {
  id: string;
  service: string;
  operation: string;
  auction_id: string | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_cents: number;
  created_at: string;
}

export default function CostsPage() {
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('api_usage')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (data) setUsage(data as any);
      setLoading(false);
    };
    fetch();
  }, []);

  const totalCents = usage.reduce((sum, u) => sum + u.estimated_cost_cents, 0);
  const totalTokens = usage.reduce((sum, u) => sum + u.input_tokens + u.output_tokens, 0);

  // Group by operation
  const byOperation: Record<string, { count: number; cents: number; tokens: number }> = {};
  for (const u of usage) {
    const key = u.operation;
    if (!byOperation[key]) byOperation[key] = { count: 0, cents: 0, tokens: 0 };
    byOperation[key].count++;
    byOperation[key].cents += u.estimated_cost_cents;
    byOperation[key].tokens += u.input_tokens + u.output_tokens;
  }

  // Last 24h
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const last24h = usage.filter((u) => new Date(u.created_at).getTime() > dayAgo);
  const last24hCents = last24h.reduce((sum, u) => sum + u.estimated_cost_cents, 0);

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header title="API Costs" backHref="/admin" />

      <div className="p-4 space-y-3">
        {loading ? (
          <p className="text-center text-gray-400 py-12">Loading...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Total Spent</p>
                <p className="text-2xl font-black text-brand-green mt-1">
                  ${(totalCents / 100).toFixed(2)}
                </p>
                <p className="text-xs text-gray-400 mt-1">{usage.length} API calls</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Last 24h</p>
                <p className="text-2xl font-black text-brand-blue mt-1">
                  ${(last24hCents / 100).toFixed(2)}
                </p>
                <p className="text-xs text-gray-400 mt-1">{last24h.length} calls</p>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-2">
                By Operation
              </h3>
              {Object.keys(byOperation).length === 0 ? (
                <p className="text-sm text-gray-400">No usage data yet</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(byOperation)
                    .sort((a, b) => b[1].cents - a[1].cents)
                    .map(([op, data]) => (
                      <div key={op} className="flex justify-between text-sm">
                        <div>
                          <p className="font-medium text-brand-navy">{op}</p>
                          <p className="text-xs text-gray-400">
                            {data.count} calls · {data.tokens.toLocaleString()} tokens
                          </p>
                        </div>
                        <p className="font-bold text-brand-green">
                          ${(data.cents / 100).toFixed(2)}
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <p className="text-xs text-gray-400 text-center mt-4">
              Costs are estimates based on Anthropic published pricing.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
