'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// Runs in the background on EVERY page of the app.
// Polls for pending jobs and kicks the processor to keep the chain alive.
// This way, as long as ANY tab of the app is open, jobs keep processing.
const POLL_INTERVAL = 15000; // 15 seconds

export default function GlobalJobPoller() {
  useEffect(() => {
    const supabase = createClient();

    const checkAndKick = async () => {
      try {
        // Check if there are any pending or stuck-processing jobs
        const { data } = await supabase
          .from('jobs')
          .select('id, status, started_at')
          .in('status', ['pending', 'processing']);

        if (!data || data.length === 0) return;

        const pending = data.filter((j) => j.status === 'pending').length;
        const processing = data.filter((j) => j.status === 'processing').length;

        // Kick if there are pending jobs OR if processing jobs look stuck (> 90s old)
        const now = Date.now();
        const stuckProcessing = data.filter((j) => {
          if (j.status !== 'processing' || !j.started_at) return false;
          const elapsed = now - new Date(j.started_at).getTime();
          return elapsed > 90000;
        }).length;

        if (pending > 0 || stuckProcessing > 0) {
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
