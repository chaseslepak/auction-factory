import { SupabaseClient } from '@supabase/supabase-js';

// Rough estimated costs per 1M tokens (Anthropic pricing, April 2026)
const COSTS_PER_MTOK = {
  'claude-opus-4-6': { input: 15, output: 75 }, // $15/$75
  'claude-sonnet-4-6': { input: 3, output: 15 }, // $3/$15
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
};

export function estimateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = COSTS_PER_MTOK[model as keyof typeof COSTS_PER_MTOK] || COSTS_PER_MTOK['claude-sonnet-4-6'];
  const inputCost = (inputTokens / 1_000_000) * costs.input * 100; // in cents
  const outputCost = (outputTokens / 1_000_000) * costs.output * 100;
  return Math.round(inputCost + outputCost);
}

export async function logApiUsage(
  supabase: SupabaseClient,
  params: {
    service: string;
    operation: string;
    auction_id?: string;
    lot_id?: string;
    model?: string;
    input_tokens?: number;
    output_tokens?: number;
  }
) {
  try {
    const cost = params.model
      ? estimateCostCents(params.model, params.input_tokens || 0, params.output_tokens || 0)
      : 0;
    await supabase.from('api_usage').insert({
      service: params.service,
      operation: params.operation,
      auction_id: params.auction_id || null,
      lot_id: params.lot_id || null,
      input_tokens: params.input_tokens || 0,
      output_tokens: params.output_tokens || 0,
      estimated_cost_cents: cost,
    });
  } catch {
    // Don't fail the operation if logging fails
  }
}
