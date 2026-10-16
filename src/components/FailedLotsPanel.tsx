'use client';

// Diagnostic panel for failed uploads on an auction.
//
// Groups the auction's failed lots by error_prefix so Chase can see at
// a glance whether 16 failures are "all cookie-expired" (one fix),
// "all HTTP 500 from AF" (AF server issue), or scattered individual
// errors (needs per-lot inspection). Each group expands to show the
// individual lots so he can click into them.
//
// Reads from the lots table directly — no new endpoint needed.

import { useMemo, useState } from 'react';
import Link from 'next/link';

interface FailedLot {
  id: string;
  lot_number: number | null;
  item_name: string | null;
  af_upload_error: string | null;
}

export default function FailedLotsPanel({
  auctionId,
  lots,
}: {
  auctionId: string;
  lots: Array<any>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const failed: FailedLot[] = useMemo(
    () =>
      (lots || [])
        .filter((l) => l?.af_upload_status === 'failed')
        .map((l) => ({
          id: l.id,
          lot_number: l.lot_number ?? null,
          item_name: l.item_name ?? null,
          af_upload_error: l.af_upload_error ?? null,
        })),
    [lots],
  );

  const groups = useMemo(() => {
    const map: Record<string, FailedLot[]> = {};
    for (const l of failed) {
      const key = normalizeError(l.af_upload_error);
      if (!map[key]) map[key] = [];
      map[key].push(l);
    }
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [failed]);

  if (failed.length === 0) return null;

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-red-100 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-black text-sm text-red-600 uppercase tracking-wide">
          {failed.length} failed upload{failed.length === 1 ? '' : 's'}
        </h3>
        <span className="text-[11px] text-gray-400">
          {groups.length} error type{groups.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="space-y-2">
        {groups.map(([errorKey, lotList]) => {
          const open = expanded.has(errorKey);
          return (
            <div key={errorKey} className="border border-gray-100 rounded-lg">
              <button
                onClick={() => {
                  const next = new Set(expanded);
                  if (open) next.delete(errorKey);
                  else next.add(errorKey);
                  setExpanded(next);
                }}
                className="w-full flex items-center justify-between p-2 text-left"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <p className="text-[11px] font-bold text-brand-navy uppercase tracking-wide">
                    {humanLabel(errorKey)} · {lotList.length}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{errorKey}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                    {diagnosisFor(errorKey)}
                  </p>
                </div>
                <span className="text-gray-300 text-xs">{open ? '▾' : '▸'}</span>
              </button>
              {open && (
                <div className="border-t border-gray-100 p-2 space-y-1">
                  {lotList.map((l) => (
                    <Link
                      key={l.id}
                      href={`/auctions/${auctionId}/lots/${l.id}/review`}
                      className="block text-xs text-brand-blue hover:underline"
                    >
                      Lot {l.lot_number ?? '?'} — {l.item_name || '(no name)'}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-gray-500 mt-3 leading-snug">
        To retry: use HQ Push to AF again. Uploaded lots are skipped automatically; only failed lots are re-attempted.
      </p>
    </div>
  );
}

// Collapse variable parts of the error so similar failures group
// together: strip IDs, timestamps, bodies, cookie fragments.
function normalizeError(err: string | null): string {
  if (!err) return '(no error recorded)';
  let s = err;
  // "HTTP 500" / "HTTP 429" → group together as "HTTP 5xx" / "HTTP 4xx"
  s = s.replace(/HTTP\s+(\d)\d\d\b/g, 'HTTP $1xx');
  // Collapse long body dumps and cookie values
  s = s.replace(/First500:[\s\S]*$/, 'First500: …');
  s = s.replace(/Cookie:\s*[^\s,]+/g, 'Cookie: …');
  s = s.replace(/\?item=\d+/g, '?item=…');
  // Trim to the first line, 180 chars
  s = s.split('\n')[0].slice(0, 180).trim();
  return s;
}

function humanLabel(key: string): string {
  if (/session expired|login form|PHPSESSID/i.test(key)) return 'AF session expired';
  if (/HTTP 5xx/.test(key)) return 'AF server error';
  if (/HTTP 4xx/.test(key)) return 'AF rejected';
  if (/HTTP 429/.test(key)) return 'AF rate limit';
  if (/NETWORK_ERROR/.test(key)) return 'Network error';
  if (/TIMEOUT_UNCERTAIN/.test(key)) return 'Timeout — may have landed';
  if (/FORBIDDEN_BY_AF/.test(key)) return 'AF forbidden (CSRF)';
  if (/stuck uploading/.test(key)) return 'Reclaimed from stuck state';
  if (/AF_REJECTED_SOFT/.test(key)) return 'AF soft-rejected';
  if (/no error recorded/.test(key)) return 'Unknown';
  return 'Other';
}

function diagnosisFor(key: string): string {
  if (/session expired|login form|PHPSESSID/i.test(key))
    return "AF kicked us out mid-batch. Auto-renew should catch this on retry — click HQ Push again.";
  if (/HTTP 5xx/.test(key))
    return "AF's server threw an error. Usually transient — retry.";
  if (/HTTP 429/.test(key))
    return 'AF rate limit. Slower batches help; retry in a few minutes.';
  if (/NETWORK_ERROR/.test(key))
    return 'Connection dropped mid-POST. Retry.';
  if (/TIMEOUT_UNCERTAIN/.test(key))
    return 'POST sent but response never came. May already be on AF — check before retrying.';
  if (/FORBIDDEN_BY_AF/.test(key))
    return "AF rejected the CSRF token. Next attempt fetches a fresh one — retry.";
  if (/stuck uploading/.test(key))
    return 'A prior batch died mid-run and left this lot in limbo. Retry.';
  if (/AF_REJECTED_SOFT/.test(key))
    return 'AF accepted the POST but returned to the form (missing required field, failed validation). Open the lot and check.';
  return 'Open the lot to inspect.';
}
