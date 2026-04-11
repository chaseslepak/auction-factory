'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// Runs in the background on EVERY page of the app.
// Polls for pending jobs and kicks the processor to keep the chain alive.
// This way, as long as ANY tab of the app is open, jobs keep processing.
const POLL_INTERVAL = 8000; // 8 seconds

export default function GlobalJobPoller() {
  useEffect(() => {
    const supabase = createClient();

    const checkAndKick = async () => {
      try {
        // Reset stuck 'processing' jobs first (> 90s old)
        const ninetySecondsAgo = new Date(Date.now() - 90000).toISOString();
        await supabase
          .from('jobs')
          .update({ status: 'pending' })
          .eq('status', 'processing')
          .lt('started_at', ninetySecondsAgo);

        // Now check for pending jobs
        const { count } = await supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');

        if (count && count > 0) {
          // Always kick if there are pending jobs
          fetch('/api/jobs/process', { method: 'POST' }).catch(() => {});
        }
      } catch {}
    };

    // Kick on mount
    checkAndKick();

    // Then every 15 seconds
    const interval = setInterval(checkAndKick, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  return null;
}
