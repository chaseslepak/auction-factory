'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Status = 'checking' | 'alive' | 'dead' | 'unknown';

// Small status chip that pings /api/af-keepalive on mount and shows
// whether the stored AF admin session is still valid. Silent when
// everything is fine; loud when the session is dead so someone
// notices and re-connects before uploads start failing.
export default function AfSessionBadge() {
  const [status, setStatus] = useState<Status>('checking');
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch('/api/af-keepalive', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data.alive) {
          setStatus('alive');
        } else {
          setStatus('dead');
          setReason(data.reason || data.error || null);
        }
      } catch (err: any) {
        if (cancelled) return;
        setStatus('unknown');
        setReason(err?.message || 'network error');
      }
    };
    check();
    // Re-check every 2 minutes so a session that dies mid-session
    // becomes visible without needing a page reload.
    const interval = setInterval(check, 2 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (status === 'checking' || status === 'alive') {
    // Only show a badge when there's a problem. Green "everything's fine"
    // chips just add noise.
    return null;
  }

  return (
    <Link
      href="/settings"
      className="block bg-red-50 border border-red-300 rounded-lg px-3 py-2 text-xs text-red-800 hover:bg-red-100"
    >
      <span className="font-black uppercase tracking-wide">AF session expired</span>
      {reason ? <span className="ml-2 text-red-600">({reason})</span> : null}
      <span className="ml-2 underline">Reconnect</span>
    </Link>
  );
}
