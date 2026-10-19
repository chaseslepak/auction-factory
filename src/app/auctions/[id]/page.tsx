'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Auction, LotWithPhotos } from '@/lib/types';
import Header from '@/components/Header';
import GradientButton from '@/components/GradientButton';
import ConfidenceChip from '@/components/ConfidenceChip';
import ProgressBar from '@/components/ProgressBar';
import ToastStack, { useToasts } from '@/components/Toast';
import AfSessionBadge from '@/components/AfSessionBadge';
import { LotCardSkeleton } from '@/components/LoadingSkeleton';
import FailedLotsPanel from '@/components/FailedLotsPanel';

export default function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toasts, show: showToast, dismiss: dismissToast } = useToasts();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [lots, setLots] = useState<LotWithPhotos[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  // Pause/resume (2026-10-18): user can halt a long push mid-run and
  // resume later without losing progress. pausedRef mirrors the state
  // for inside the batch loop since React state closes over values at
  // call time.
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  const [resyncingPricing, setResyncingPricing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState({ current: 0, total: 0 });
  const [afLinked, setAfLinked] = useState(false);
  const [showAfLink, setShowAfLink] = useState(false);
  const [afAuctionId, setAfAuctionId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'uploaded' | 'not_uploaded' | 'failed'>('all');
  const [sortBy, setSortBy] = useState<'lot_number' | 'price_desc' | 'price_asc' | 'confidence'>('lot_number');
  const [selectedLots, setSelectedLots] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [afAuctions, setAfAuctions] = useState<{ id: string; name: string }[]>([]);
  const supabase = createClient();

  // Per-tab push nonce. The push lock on /api/af-upload uses this to
  // detect two-tabs-same-user race conditions: all batches within one
  // push session share this nonce (allowed to re-acquire the lock);
  // a second tab generates a different nonce and gets refused.
  // sessionStorage is per-tab so this stays unique even in the same
  // browser profile.
  const pushNonce = useMemo(() => {
    if (typeof window === 'undefined') return '';
    try {
      const existing = window.sessionStorage.getItem('af_push_nonce');
      if (existing) return existing;
      const fresh =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? (crypto as any).randomUUID()
          : `n_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      window.sessionStorage.setItem('af_push_nonce', fresh);
      return fresh;
    } catch {
      return `n_${Date.now()}`;
    }
  }, []);

  const fetchData = async () => {
    const [auctionRes, lotsRes, afMapRes] = await Promise.all([
      supabase.from('auctions').select('*').eq('id', id).single(),
      supabase
        .from('lots')
        .select('*, lot_photos(*)')
        .eq('auction_id', id)
        .is('deleted_at', null)
        .order('lot_number', { ascending: true }),
      supabase
        .from('af_auction_map')
        .select('af_auction_id')
        .eq('auction_id', id)
        .single(),
    ]);

    if (auctionRes.data) setAuction(auctionRes.data);
    if (lotsRes.data) setLots(lotsRes.data as LotWithPhotos[]);
    if (afMapRes.data) {
      setAfLinked(true);
      setAfAuctionId(afMapRes.data.af_auction_id);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleShowAfLink = async () => {
    setShowAfLink(true);
    setAfAuctions([]);
    try {
      const res = await fetch('/api/af-auctions');
      const data = await res.json();
      if (data.auctions && data.auctions.length > 0) {
        setAfAuctions(data.auctions);
      } else if (data.error) {
        // Surface the diagnostics array if the server included one so
        // Chase can see which candidate URL AF served and how many
        // <option> tags were on each page — tells us at a glance if
        // the dropdown lives at a new URL or the <option> markup
        // changed.
        const diag = Array.isArray(data.diagnostics)
          ? data.diagnostics
              .map(
                (d: any) =>
                  `${d.url} → HTTP ${d.http_status}, ${d.option_count} options, ${d.auction_count} auctions`
              )
              .join('\n')
          : '';
        setUploadMsg({
          type: 'error',
          text: diag
            ? `AF auctions: ${data.error}\n\n${diag}`
            : `AF auctions: ${data.error}`,
        });
      } else {
        setUploadMsg({ type: 'error', text: 'No AF auctions found. Check AF session in Settings.' });
      }
    } catch (err: any) {
      setUploadMsg({ type: 'error', text: `Failed to fetch AF auctions: ${err.message}` });
    }
  };

  const handleLinkAf = async () => {
    if (!afAuctionId.trim()) return;
    await supabase.from('af_auction_map').upsert({
      auction_id: id,
      af_auction_id: afAuctionId.trim(),
    });
    setAfLinked(true);
    setShowAfLink(false);
  };

  const handleReuploadToAf = async () => {
    const uploaded = lots.filter((l) => l.af_upload_status === 'uploaded');
    if (uploaded.length === 0) {
      setUploadMsg({ type: 'error', text: 'No uploaded lots to re-upload.' });
      return;
    }
    if (!confirm(`Re-upload ${uploaded.length} lot(s) to Auction Factory? This creates NEW lots on AF — you must manually delete the old ones in the AF admin.`)) return;

    setUploading(true);
    setUploadMsg(null);

    // Reset their upload status so the upload route will process them
    await supabase
      .from('lots')
      .update({ af_upload_status: null, af_upload_error: null })
      .in('id', uploaded.map((l) => l.id));

    // Refresh lots state
    await fetchData();

    const BATCH_SIZE = 1;
    const batches: string[][] = [];
    for (let i = 0; i < uploaded.length; i += BATCH_SIZE) {
      batches.push(uploaded.slice(i, i + BATCH_SIZE).map((l) => l.id));
    }

    let totalSucceeded = 0;
    let totalFailed = 0;
    let lastError: string | null = null;

    try {
      for (let i = 0; i < batches.length; i++) {
        setUploadMsg({
          type: 'success',
          text: `Re-uploading batch ${i + 1}/${batches.length} (${totalSucceeded}/${uploaded.length} done)...`,
        });

        // Wrap each batch in its own try so one malformed response (AF
        // returning HTML for a 502, or a missing `results` key) doesn't
        // abort the whole run.
        try {
          const res = await fetch('/api/af-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              auction_id: id,
              lot_ids: batches[i],
              push_nonce: pushNonce,
            }),
          });

          const responseText = await res.text();
          let data: any;
          try {
            data = JSON.parse(responseText);
          } catch {
            lastError = `Batch ${i + 1}: non-JSON response (status ${res.status})`;
            totalFailed += batches[i].length;
            continue;
          }

          if (data.error) {
            lastError = data.error;
            totalFailed += batches[i].length;
            if (data.error.includes('session expired') || data.error.includes('Please re-login')) {
              break;
            }
            continue;
          }

          const resultsArr = Array.isArray(data.results) ? data.results : [];
          const succeeded = resultsArr.filter((r: any) => r.success).length;
          const failed = resultsArr.filter((r: any) => !r.success).length;
          totalSucceeded += succeeded;
          totalFailed += failed;
          fetchData();
        } catch (batchErr: any) {
          lastError = `Batch ${i + 1}: ${batchErr?.message || String(batchErr)}`;
          totalFailed += batches[i].length;
        }
      }

      setUploadMsg({
        type: totalFailed === 0 ? 'success' : 'error',
        text: totalFailed === 0
          ? `${totalSucceeded} lot(s) re-uploaded! Delete old ones in AF admin.`
          : `${totalSucceeded} re-uploaded, ${totalFailed} failed${lastError ? `: ${lastError}` : ''}`,
      });
      fetchData();
    } catch (err: any) {
      setUploadMsg({ type: 'error', text: err.message });
    }

    setUploading(false);
  };

  const handleResyncPricing = async () => {
    const lotCount = lots.length;
    if (lotCount === 0) {
      setUploadMsg({ type: 'error', text: 'No lots in this auction to resync.' });
      return;
    }
    if (!confirm(
      `Refresh pricing on all ${lotCount} lot(s) in this auction?\n\n` +
      `This re-applies the current pricing convention (title suffix "($N)", description "Retail Price: $N" line, and listed_price) to every lot using its estimated_retail_new as the source of truth.\n\n` +
      `Lotter-only — items already on AF stay as-is until re-pushed.\n\n` +
      `Continue?`,
    )) return;

    setResyncingPricing(true);
    setUploadMsg(null);
    try {
      const res = await fetch(`/api/admin/resync-pricing/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadMsg({ type: 'error', text: data?.error || `HTTP ${res.status}` });
      } else {
        const noteParts = [
          `${data.updated} lot(s) updated`,
        ];
        if (data.unchanged) noteParts.push(`${data.unchanged} already matched`);
        if (data.skipped_no_retail) noteParts.push(`${data.skipped_no_retail} skipped (no retail price)`);
        setUploadMsg({ type: 'success', text: noteParts.join(' · ') });
        await fetchData();
      }
    } catch (err: any) {
      setUploadMsg({ type: 'error', text: err?.message || 'Resync failed' });
    } finally {
      setResyncingPricing(false);
    }
  };

  const handleRefreshStockImages = async () => {
    if (!confirm('Search for stock images and pricing for all "new in box" (condition 10) lots with known brand+model?\n\nThis runs in the background — you can close this tab and come back later.\n\nTo search on a non-"new in box" lot, open that lot and use its "Find Stock Image" button.')) return;
    setRefreshing(true);
    setUploadMsg(null);
    setRefreshProgress({ current: 0, total: 0 });

    try {
      // Enqueue all candidate lots as background jobs
      const enqueueRes = await fetch('/api/jobs/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auction_id: id }),
      });

      const enqueueText = await enqueueRes.text();
      let enqueueData: any;
      try {
        enqueueData = JSON.parse(enqueueText);
      } catch {
        throw new Error(`Server returned non-JSON: ${enqueueText.substring(0, 150)}`);
      }

      if (!enqueueRes.ok || enqueueData.error) {
        throw new Error(enqueueData.error || `Server error ${enqueueRes.status}`);
      }

      if (enqueueData.enqueued === 0) {
        setUploadMsg({ type: 'error', text: enqueueData.message });
        setRefreshing(false);
        return;
      }

      setUploadMsg({
        type: 'success',
        text: `Queued ${enqueueData.enqueued} lots — processing in background. Safe to close tab.`,
      });

      // Start polling for progress
      pollJobStatus();
    } catch (err: any) {
      setUploadMsg({ type: 'error', text: err.message });
      setRefreshing(false);
    }
  };

  // Cap the poll loop so a stuck job (Anthropic outage, orphaned pending
  // row, etc.) can't burn tablet battery and rack up processor kicks
  // forever. Scale the cap to how many lots we actually queued — each
  // stock-image lookup can take 10–30 s, so a 300-lot batch legitimately
  // runs 60+ min. Floor 3 min, ceiling 90 min; poll every 3 s.
  const POLL_INTERVAL_MS = 3000;
  const SECONDS_PER_LOT_ESTIMATE = 25;
  const pollCapForLots = (lots: number) => {
    const estSec = Math.max(180, Math.min(5400, lots * SECONDS_PER_LOT_ESTIMATE));
    return Math.ceil(estSec * 1000 / POLL_INTERVAL_MS);
  };

  const pollJobStatus = async (lastDone = -1, stallCount = 0, attempts = 0, cap: number | null = null) => {
    // When the first poll fires we may not yet know how many lots were queued.
    // The cap gets set below once we see `data.total`. Until then we use a
    // generous default (10 min) so a slow queue-enqueue call doesn't trip us.
    const effectiveCap = cap ?? 200;
    if (attempts >= effectiveCap) {
      setRefreshing(false);
      const minutes = Math.round((effectiveCap * POLL_INTERVAL_MS) / 60000);
      setUploadMsg({
        type: 'error',
        text: `Browser stopped tracking after ${minutes} min — jobs are still running on the server. Check Admin → Jobs or reload this page to resume live tracking.`,
      });
      return;
    }
    try {
      const res = await fetch(`/api/jobs/status?auction_id=${id}`);
      if (!res.ok) {
        setRefreshing(false);
        return;
      }
      const data = await res.json();

      const done = (data.completed || 0) + (data.failed || 0);
      const total = data.total || 0;

      setRefreshProgress({ current: done, total });

      // Lock in a lot-count-scaled cap as soon as we know `total`. Keeps a
      // 368-lot batch from hitting a 3-min cap it legitimately needs 90+
      // min to finish.
      const nextCap = cap ?? (total > 0 ? pollCapForLots(total) : null);

      if (data.active) {
        // Detect stall: if nothing changed since last poll, kick the processor
        const isStalled = done === lastDone;
        const newStallCount = isStalled ? stallCount + 1 : 0;

        // Kick every 2 stalls (6 seconds) if progress is stuck
        if (newStallCount >= 2) {
          fetch('/api/jobs/process', { method: 'POST' }).catch(() => {});
        }
        // Also always kick if there are pending jobs but nothing processing
        if ((data.pending || 0) > 0 && (data.processing || 0) === 0) {
          fetch('/api/jobs/process', { method: 'POST' }).catch(() => {});
        }

        // Still processing, poll again
        setTimeout(() => pollJobStatus(done, newStallCount, attempts + 1, nextCap), POLL_INTERVAL_MS);
      } else {
        // All done
        setRefreshing(false);
        if (total > 0) {
          setUploadMsg({
            type: 'success',
            text: `Done! ${data.found || 0} stock images found, ${total} lots processed`,
          });
          fetchData();
          // Clean up completed jobs
          fetch(`/api/jobs/status?auction_id=${id}`, { method: 'DELETE' }).catch(() => {});
        }
      }
    } catch {
      setRefreshing(false);
    }
  };

  // On mount, check if there are active jobs and resume polling
  useEffect(() => {
    const checkActiveJobs = async () => {
      try {
        const res = await fetch(`/api/jobs/status?auction_id=${id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.active) {
          setRefreshing(true);
          pollJobStatus();
        }
      } catch {}
    };
    if (id) checkActiveJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleMarkReady = async () => {
    if (!confirm('Mark this auction as ready for HQ upload?\n\nHQ will push it to Auction Factory using the correct AF admin login.')) return;
    const { error } = await supabase
      .from('auctions')
      .update({
        hq_upload_status: 'ready',
        hq_ready_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) {
      const missingCol = /column .* does not exist/i.test(error.message);
      setUploadMsg({
        type: 'error',
        text: missingCol
          ? 'Missing DB migration — run supabase/phase9_hq_upload_queue.sql in the Supabase SQL Editor, then try again.'
          : `Mark Ready failed: ${error.message}`,
      });
      return;
    }
    await fetchData();
  };

  const handleUnmarkReady = async () => {
    if (!confirm('Unmark ready? HQ will not push this auction until it\'s marked ready again.')) return;
    const { error } = await supabase
      .from('auctions')
      .update({ hq_upload_status: null, hq_ready_at: null })
      .eq('id', id);
    if (error) {
      setUploadMsg({ type: 'error', text: `Unmark failed: ${error.message}` });
      return;
    }
    await fetchData();
  };

  const handleResetFromFailed = async () => {
    // Only reset lots that ACTUALLY failed. The previous behavior reset every
    // lot from the first failure onward — including ones that had already
    // succeeded — which then caused those to be re-uploaded and AF ended up
    // with duplicates.
    const failed = lots
      .filter((l: any) => l.af_upload_status === 'failed')
      .sort((a, b) => a.lot_number - b.lot_number);

    if (failed.length === 0) {
      setUploadMsg({ type: 'error', text: 'No failed lots.' });
      return;
    }

    const confirmed = confirm(
      `Retry ${failed.length} failed lot${failed.length > 1 ? 's' : ''} (#${failed[0].lot_number}` +
        (failed.length > 1 ? `–#${failed[failed.length - 1].lot_number}` : '') +
        `)?\n\n` +
        `Only the lots that failed will be re-uploaded. Already-uploaded lots will NOT be touched, so you cannot create AF duplicates.\n\n` +
        `Note: retried lots will be added to AF at the end of the current list — you may need to fix their order in AF admin afterward.`
    );
    if (!confirmed) return;

    await supabase
      .from('lots')
      .update({ af_upload_status: null, af_upload_error: null })
      .in('id', failed.map((l) => l.id));

    await fetchData();

    setUploadMsg({
      type: 'success',
      text: `Reset ${failed.length} failed lot${failed.length > 1 ? 's' : ''}. Click "HQ Push to AF" above to retry.`,
    });
  };

  const handleUploadToAf = async (opts?: { resume?: boolean }) => {
    const isResume = !!opts?.resume;
    // Sort by lot_number to guarantee upload order (this is critical!)
    const unuploaded = lots
      .filter((l) => l.af_upload_status !== 'uploaded')
      .slice()
      .sort((a, b) => a.lot_number - b.lot_number);
    if (unuploaded.length === 0) {
      setUploadMsg({ type: 'error', text: 'All lots already uploaded.' });
      return;
    }

    // Pre-flight: duplicate-title check. If AI generated identical
    // normalized item_names for two different lots (different brand +
    // model), the relot-sync title matcher pairs them in the wrong
    // order on subsequent audits. Easier to fix now than untangle
    // later. Normalize = lowercase + collapse whitespace.
    const norm = (s: string | null) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const titleGroups = new Map<string, Array<typeof unuploaded[number]>>();
    for (const l of unuploaded) {
      const key = norm(l.item_name);
      if (!key) continue;
      const g = titleGroups.get(key) || [];
      g.push(l);
      titleGroups.set(key, g);
    }
    const conflicting: string[] = [];
    titleGroups.forEach((group) => {
      if (group.length < 2) return;
      const brandModels = new Set(group.map((l: any) => `${norm(l.brand)}|${norm(l.model)}`));
      if (brandModels.size > 1) {
        conflicting.push(
          `"${group[0].item_name}" — lots ${group.map((l) => `#${l.lot_number}`).join(', ')} share this title but differ in brand/model`
        );
      }
    });
    if (conflicting.length > 0) {
      const dialog =
        `Found ${conflicting.length} title collision${conflicting.length > 1 ? 's' : ''}:\n\n` +
        conflicting.slice(0, 5).join('\n') +
        (conflicting.length > 5 ? `\n…and ${conflicting.length - 5} more` : '') +
        `\n\nThese will cause audit mismatches later. Edit the item_name on one of each conflicting pair, then try again. ` +
        `Click OK to proceed anyway (not recommended).`;
      if (!confirm(dialog)) return;
    }

    // Pre-flight: AF session cookie health. The daily keepalive at
    // 06:00 UTC is thin coverage. A push at 22:00 UTC rides a 16-hour
    // cookie that MAY be stale. If stale, the first lot of the batch
    // fails and the whole thing cascades. Catch it before the first
    // POST so no bad state lands on AF.
    setUploadMsg({ type: 'success', text: 'Checking AF session…' });
    try {
      const pre = await fetch('/api/af-keepalive', { method: 'GET' });
      const preData = await pre.json().catch(() => ({}));
      if (!preData?.alive) {
        setUploadMsg({
          type: 'error',
          text: 'AF session expired — reconnect in Settings before pushing. (Pre-flight check caught this before any lot was uploaded.)',
        });
        return;
      }
    } catch {
      // Keepalive endpoint unreachable — not fatal, let the actual
      // upload surface the error. Don't block the push on a flaky
      // health check.
    }

    // Resume path skips the Mode A "AF assumed empty" confirmation
    // because resume continues an existing push — AF already has
    // partial content, that's expected.
    if (!isResume) {
      if (!confirm(
        `Upload ${unuploaded.length} lot(s) to Auction Factory?\n\n` +
        `⚠ Mode A: this push ASSUMES AF is empty for this auction.\n` +
        `If AF already has items, you'll get DUPLICATES — delete them on AF first.\n\n` +
        `If an individual lot fails during upload, a placeholder stub will be inserted on AF to preserve the lot's position; the lot stays marked 'failed' in the lotter so you can fix it and re-push.\n\n` +
        `Continue?`,
      )) return;
    }

    setUploading(true);
    setUploadMsg(null);
    setUploadProgress({ current: 0, total: unuploaded.length });

    const BATCH_SIZE = 1;
    const batches: string[][] = [];
    for (let i = 0; i < unuploaded.length; i += BATCH_SIZE) {
      batches.push(unuploaded.slice(i, i + BATCH_SIZE).map((l) => l.id));
    }

    let totalSucceeded = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let lastError: string | null = null;

    try {
      for (let i = 0; i < batches.length; i++) {
        // PAUSE check — stop before the next batch's request fires.
        // Any in-flight batch finishes normally so no partial writes.
        if (pausedRef.current) {
          lastError = `Push paused by user after ${totalSucceeded + totalFailed} of ${unuploaded.length} lots. Click Resume to continue from where you left off.`;
          break;
        }

        try {
          const res = await fetch('/api/af-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              auction_id: id,
              lot_ids: batches[i],
              push_nonce: pushNonce,
            }),
          });

          // Parse response safely — don't let one bad batch kill the whole loop
          const responseText = await res.text();
          let data: any;
          try {
            data = JSON.parse(responseText);
          } catch {
            // Server returned HTML (timeout/500) — mark this batch as failed and continue
            lastError = `Server error on batch ${i + 1} (status ${res.status})`;
            totalFailed += batches[i].length;
            await supabase
              .from('lots')
              .update({ af_upload_status: 'failed', af_upload_error: 'Server timeout or error' })
              .in('id', batches[i]);
            setUploadProgress({ current: totalSucceeded + totalFailed, total: unuploaded.length });
            continue;
          }

          if (data.error) {
            lastError = data.error;
            totalFailed += batches[i].length;
            // Only stop on session expired — everything else, keep going
            if (data.error.includes('session expired') || data.error.includes('Please re-login')) {
              break;
            }
            continue;
          }

          const succeeded = data.results.filter((r: any) => r.success).length;
          const skippedBatch = data.results.filter((r: any) => r.skipped).length;
          // 'failed' for progress-counting purposes includes skipped — they are
          // not in the queue anymore and shouldn't be retried.
          const failed = data.results.filter((r: any) => !r.success).length;
          totalSucceeded += succeeded;
          totalFailed += failed;
          totalSkipped += skippedBatch;

          setUploadProgress({ current: totalSucceeded + totalFailed, total: unuploaded.length });
          fetchData();

          // Circuit breaker: once we've attempted enough lots to form a
          // signal, abort the whole batch if the REAL failure rate is
          // above the threshold. Skipped lots (idempotency guard
          // skips, pre-flight placeholders, already-uploaded) are NOT
          // real failures — they must be excluded or re-pushing a
          // partially-uploaded auction trips the breaker falsely.
          const CIRCUIT_MIN_ATTEMPTS = 20;
          const CIRCUIT_FAIL_RATE = 0.3;
          const realFailedSoFar = totalFailed - totalSkipped;
          const attempted = totalSucceeded + realFailedSoFar;
          if (
            attempted >= CIRCUIT_MIN_ATTEMPTS &&
            realFailedSoFar / attempted > CIRCUIT_FAIL_RATE
          ) {
            lastError = `Circuit breaker tripped — ${realFailedSoFar} of ${attempted} real attempts failed (${Math.round((realFailedSoFar / attempted) * 100)}%). Aborting the batch to avoid wasted requests. Fix the root cause (session, CSRF, etc.) and click HQ Push again.`;
            break;
          }
        } catch (batchErr: any) {
          // Network error or other exception — mark batch as failed and continue
          lastError = batchErr.message || 'Batch error';
          totalFailed += batches[i].length;
          try {
            await supabase
              .from('lots')
              .update({
                af_upload_status: 'failed',
                af_upload_error: batchErr.message || 'Network error',
              })
              .in('id', batches[i]);
          } catch {}
          setUploadProgress({ current: totalSucceeded + totalFailed, total: unuploaded.length });
        }
      }

      let realFailed = totalFailed - totalSkipped;

      // Automatic second pass. If the first batch left any lots in
      // 'failed' state, give them one more full attempt before surfacing
      // the error to Chase. Combined with the server's 3-retry window
      // on transient errors (NETWORK_ERROR, FORBIDDEN_BY_AF: 403, 5xx,
      // 429), each lot effectively gets up to 6 attempts before we give
      // up. Chase: "I can't have failures."
      if (realFailed > 0) {
        setUploadMsg({
          type: 'success',
          text: `${totalSucceeded} uploaded, ${realFailed} failed — retrying the failed ones once…`,
        });
        // Pull a fresh list of ids that ARE still 'failed' on this
        // auction, not just the ones we think failed above (handles
        // mid-session race where another tab retried some).
        const { data: stillFailed } = await supabase
          .from('lots')
          .select('id')
          .eq('auction_id', id)
          .eq('af_upload_status', 'failed')
          .is('deleted_at', null);
        const retryIds = (stillFailed || []).map((r: any) => r.id);
        const retryBatches: string[][] = [];
        for (let i = 0; i < retryIds.length; i += BATCH_SIZE) {
          retryBatches.push(retryIds.slice(i, i + BATCH_SIZE));
        }
        let retrySucceeded = 0;
        for (let i = 0; i < retryBatches.length; i++) {
          if (pausedRef.current) break; // Respect pause in retry pass too.
          try {
            const res = await fetch('/api/af-upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ auction_id: id, lot_ids: retryBatches[i], push_nonce: pushNonce }),
            });
            const data = await res.json().catch(() => null);
            if (!data || data.error) continue;
            retrySucceeded += (data.results || []).filter((r: any) => r.success).length;
          } catch {
            // Swallow — next batch keeps going.
          }
        }
        totalSucceeded += retrySucceeded;
        realFailed -= retrySucceeded;
        setUploadProgress({ current: totalSucceeded + realFailed + totalSkipped, total: unuploaded.length });
      }

      // Fire ONE relot-sync pass now that the whole push loop + retry
      // pass is done. Previously the server fired this per 1-lot batch
      // (300 lots → 300 overlapping relot POSTs stomping each other,
      // which caused "out of order" + 429-cascade "failed lots" on
      // 2026-10-17). Firing once from the client guarantees exactly one
      // pass. Best-effort: never block the UI message on it.
      if (totalSucceeded > 0) {
        setUploadMsg({ type: 'success', text: `${totalSucceeded} uploaded — re-aligning lot order on AF…` });
        try {
          const relotRes = await fetch(`/api/relot-sync/${id}`, { method: 'POST' });
          const relotData = await relotRes.json().catch(() => null);
          if (!relotRes.ok || !relotData?.ok) {
            console.warn('End-of-push relot-sync did not confirm success:', relotData);
          }
        } catch (relotErr) {
          console.warn('End-of-push relot-sync fetch failed:', relotErr);
        }
      }

      const skippedNote = totalSkipped > 0
        ? ` (${totalSkipped} already uploaded — skipped to avoid duplicates)`
        : '';
      if (lastError && totalSucceeded === 0 && totalSkipped === 0) {
        setUploadMsg({ type: 'error', text: lastError });
      } else {
        setUploadMsg({
          type: realFailed === 0 ? 'success' : 'error',
          text: realFailed === 0
            ? `${totalSucceeded} lot${totalSucceeded !== 1 ? 's' : ''} uploaded to AF${skippedNote}!`
            : `${totalSucceeded} uploaded, ${realFailed} failed after retry${skippedNote}${lastError ? `. Last error: ${lastError}` : ''}. Click HQ Push again to try again, or open a failed lot to see its specific error.`,
        });
      }
      fetchData();
    } catch (err: any) {
      setUploadMsg({ type: 'error', text: err.message });
    }

    setUploading(false);
    setUploadProgress({ current: 0, total: 0 });
    // Reset pause flag so the next push isn't instantly paused.
    setPaused(false);
    pausedRef.current = false;
  };

  const deleteLot = async (lotId: string) => {
    // Look up the lot number for the toast message before we soft-delete it
    const target = lots.find((l) => l.id === lotId);
    const label = target ? `Lot #${target.lot_number}` : 'Lot';

    // Soft delete — keeps photos and data, just marks as deleted
    await supabase
      .from('lots')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', lotId);
    fetchData();

    // Show a toast with an Undo action. 7s window before the delete becomes
    // "permanent" (it's still recoverable from /admin/trash after that).
    showToast({
      message: `${label} deleted.`,
      tone: 'info',
      durationMs: 7000,
      action: {
        label: 'Undo',
        onClick: async () => {
          await supabase
            .from('lots')
            .update({ deleted_at: null })
            .eq('id', lotId);
          fetchData();
        },
      },
    });
  };

  const getPhotoUrl = (path: string) => {
    const { data } = supabase.storage.from('lot-photos').getPublicUrl(path);
    return data.publicUrl;
  };

  // Supabase doesn't guarantee joined-table row order — sort by
  // display_order and return the primary. The stock-image processor
  // inserts new stock photos with display_order=0 and shifts existing
  // photos up by 1, so this makes the stock image appear first on the
  // lots list once it's been found.
  const getPrimaryPhoto = (lot: LotWithPhotos) => {
    const photos = lot.lot_photos || [];
    if (photos.length === 0) return null;
    return [...photos].sort(
      (a, b) => ((a as any).display_order ?? 0) - ((b as any).display_order ?? 0)
    )[0];
  };

  // Compute filtered + sorted lots
  const filteredLots = (() => {
    let result = [...lots];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((lot) => {
        return (
          (lot.item_name || '').toLowerCase().includes(q) ||
          (lot.brand || '').toLowerCase().includes(q) ||
          (lot.model || '').toLowerCase().includes(q) ||
          String(lot.lot_number).includes(q)
        );
      });
    }

    // Filter by upload status
    if (filterStatus !== 'all') {
      result = result.filter((lot) => {
        const status = (lot as any).af_upload_status;
        if (filterStatus === 'uploaded') return status === 'uploaded';
        if (filterStatus === 'not_uploaded') return status !== 'uploaded' && status !== 'failed';
        if (filterStatus === 'failed') return status === 'failed';
        return true;
      });
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'lot_number') return a.lot_number - b.lot_number;
      if (sortBy === 'price_desc') return (Number(b.listed_price) || 0) - (Number(a.listed_price) || 0);
      if (sortBy === 'price_asc') return (Number(a.listed_price) || 0) - (Number(b.listed_price) || 0);
      if (sortBy === 'confidence') {
        const order: Record<string, number> = { high: 3, medium: 2, low: 1 };
        return (order[b.confidence || ''] || 0) - (order[a.confidence || ''] || 0);
      }
      return 0;
    });

    return result;
  })();

  const toggleLotSelection = (lotId: string) => {
    setSelectedLots((prev) => {
      const next = new Set(prev);
      if (next.has(lotId)) next.delete(lotId);
      else next.add(lotId);
      return next;
    });
  };

  const bulkDelete = async () => {
    if (selectedLots.size === 0) return;
    if (!confirm(`Delete ${selectedLots.size} selected lot(s)?`)) return;
    await supabase
      .from('lots')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', Array.from(selectedLots));
    setSelectedLots(new Set());
    setBulkMode(false);
    fetchData();
  };

  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkPriceMultiplier, setBulkPriceMultiplier] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkCondition, setBulkCondition] = useState('');

  const bulkDeepRescan = async () => {
    if (selectedLots.size === 0) return;
    if (!confirm(`Deep rescan ${selectedLots.size} lots? This uses Claude Opus 4.6 for more accurate identification, stock images, and pricing. Runs in the background.`)) return;

    // Create deep_rescan jobs for each selected lot
    const jobs = Array.from(selectedLots).map((lotId) => ({
      type: 'deep_rescan',
      status: 'pending',
      auction_id: id,
      lot_id: lotId,
    }));

    const { error } = await supabase.from('jobs').insert(jobs);
    if (error) {
      setUploadMsg({ type: 'error', text: `Failed to enqueue: ${error.message}` });
      return;
    }

    // Kick processor
    fetch('/api/jobs/process', { method: 'POST' }).catch(() => {});

    setUploadMsg({
      type: 'success',
      text: `Queued ${jobs.length} lots for deep rescan. Progress shows in Admin > Background Jobs.`,
    });
    setSelectedLots(new Set());
    setBulkMode(false);
  };

  const applyBulkEdit = async () => {
    if (selectedLots.size === 0) return;
    const updates: any = {};

    if (bulkCategory.trim()) updates.category = bulkCategory.trim();
    if (bulkCondition) updates.condition_rating = Number(bulkCondition);

    if (bulkPriceMultiplier) {
      const multi = Number(bulkPriceMultiplier);
      if (!isNaN(multi) && multi > 0) {
        // Apply multiplier per-lot (can't do in one query)
        const { computeListedPrice, syncRetailLine, formatLotTitle } = await import('@/lib/listing-price');
        const lotsToUpdate = lots.filter((l) => selectedLots.has(l.id));
        for (const lot of lotsToUpdate) {
          const currentRetail = Number(lot.estimated_retail_new) || 0;
          const newRetail = Math.round(currentRetail * multi);
          const newListed = computeListedPrice(newRetail);
          const perLotUpdate: any = {
            estimated_retail_new: newRetail,
            listed_price: newListed,
            ...updates,
          };
          // Keep "Retail Price: $X" line inside the description AND the
          // "($N)" suffix on the title in sync with the new listed_price
          // so none of the three drift apart.
          if ((lot as any).auction_description) {
            perLotUpdate.auction_description = syncRetailLine(
              (lot as any).auction_description,
              newListed
            );
          }
          if ((lot as any).item_name) {
            perLotUpdate.item_name = formatLotTitle(
              (lot as any).item_name,
              (lot as any).condition_rating,
              newListed,
            );
          }
          await supabase.from('lots').update(perLotUpdate).eq('id', lot.id);
        }
        setBulkEditOpen(false);
        setSelectedLots(new Set());
        setBulkMode(false);
        setBulkPriceMultiplier('');
        setBulkCategory('');
        setBulkCondition('');
        fetchData();
        return;
      }
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('lots').update(updates).in('id', Array.from(selectedLots));
    }
    setBulkEditOpen(false);
    setSelectedLots(new Set());
    setBulkMode(false);
    setBulkCategory('');
    setBulkCondition('');
    fetchData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg">
        <Header title="Loading..." backHref="/auctions" />
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <LotCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg pb-24">
      <Header
        title={auction?.name || 'Auction'}
        backHref="/auctions"
      />

      <div className="px-4 py-2 flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {lots.length} lot{lots.length !== 1 ? 's' : ''}
        </p>
        <Link href="/settings" className="text-xs text-brand-blue font-medium">
          Settings
        </Link>
      </div>

      <div className="px-4">
        <AfSessionBadge />
      </div>

      <div className="px-4">
        <FailedLotsPanel auctionId={id} lots={lots} />
      </div>

      {/* HQ Upload Handoff — locations mark auctions "ready", HQ pushes to AF */}
      {lots.length > 0 && (
        <div className="px-4 mb-2">
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex items-center justify-between gap-2">
            <div className="min-w-0">
              {auction?.hq_upload_status === 'ready' ? (
                <>
                  <p className="font-black text-brand-green text-sm">✓ Ready for HQ upload</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Marked {auction.hq_ready_at ? new Date(auction.hq_ready_at).toLocaleString() : ''}
                  </p>
                </>
              ) : auction?.hq_upload_status === 'uploading' ? (
                <>
                  <p className="font-black text-brand-blue text-sm">HQ uploading now…</p>
                </>
              ) : auction?.hq_upload_status === 'done' ? (
                <>
                  <p className="font-black text-brand-green text-sm">All lots uploaded to AF</p>
                </>
              ) : (
                <>
                  <p className="font-bold text-brand-navy text-sm">Ready to hand off to HQ?</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Mark ready when lotting is complete and HQ will push to AF.
                  </p>
                </>
              )}
            </div>
            {auction?.hq_upload_status === 'ready' ? (
              <button
                onClick={handleUnmarkReady}
                className="px-3 py-2 rounded-lg border border-gray-300 text-xs font-bold text-gray-500 uppercase flex-shrink-0"
              >
                Unmark
              </button>
            ) : auction?.hq_upload_status === 'done' || auction?.hq_upload_status === 'uploading' ? null : (
              <button
                onClick={handleMarkReady}
                className="px-4 py-2 rounded-lg bg-brand-green text-white text-xs font-black uppercase tracking-wide flex-shrink-0"
              >
                Mark Ready for HQ
              </button>
            )}
          </div>
        </div>
      )}

      {/* AF Upload Section (HQ-only — pushes to AF from a browser logged into the correct AF admin account) */}
      {lots.length > 0 && (
        <div className="px-4 mb-2">
          {!afLinked ? (
            <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
              {showAfLink ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">
                    Select the AF auction or enter the internal ID manually
                  </p>
                  {afAuctions.length > 0 && (
                    <div className="flex gap-2">
                      <select
                        value={afAuctionId}
                        onChange={(e) => setAfAuctionId(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-blue"
                      >
                        <option value="">Choose an auction...</option>
                        {afAuctions.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={afAuctionId}
                      onChange={(e) => setAfAuctionId(e.target.value)}
                      placeholder="Or enter AF internal ID (e.g. 4805)"
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-blue"
                    />
                    <button
                      onClick={handleLinkAf}
                      disabled={!afAuctionId}
                      className="px-4 py-2 gradient-btn text-white text-xs font-bold rounded-lg disabled:opacity-50"
                    >
                      Link
                    </button>
                  </div>
                  {afAuctions.length === 0 && (
                    <p className="text-xs text-gray-400">
                      Tip: AF internal ID can be found by going to AF admin {'>'}  Add Item {'>'}  viewing the dropdown
                    </p>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleShowAfLink}
                  className="w-full text-sm text-brand-blue font-bold"
                >
                  Link AF Auction for Upload
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={handleRefreshStockImages}
                disabled={refreshing || uploading}
                className="w-full py-2 rounded-xl border-2 border-brand-blue text-brand-blue font-bold text-xs uppercase tracking-wide disabled:opacity-50"
              >
                {refreshing ? 'Searching for stock images...' : 'Find Stock Images'}
              </button>
              <Link
                href={`/auctions/${id}/audit`}
                className="w-full block text-center py-2 rounded-xl border-2 border-brand-blue text-brand-blue font-bold text-xs uppercase tracking-wide"
              >
                Audit AF vs Lotter
              </Link>
              <button
                onClick={handleResyncPricing}
                disabled={uploading || refreshing || resyncingPricing}
                className="w-full py-2 rounded-xl border-2 border-brand-blue text-brand-blue font-bold text-xs uppercase tracking-wide disabled:opacity-50"
                title="Re-apply pricing convention (title suffix, retail line in description, listed_price) to every lot in this auction. Lotter-only; items on AF stay as-is until re-pushed."
              >
                {resyncingPricing ? 'Refreshing prices…' : 'Refresh Pricing on All Lots'}
              </button>
              <button
                onClick={() => handleUploadToAf()}
                disabled={uploading}
                className="w-full py-3 rounded-xl bg-brand-green text-white font-black text-sm uppercase tracking-wide disabled:opacity-50"
              >
                {uploading
                  ? (paused ? 'Pausing…' : `Pushing to AF… ${uploadProgress.current}/${uploadProgress.total}`)
                  : 'HQ Push to AF'}
              </button>
              {uploading && !paused && (
                <button
                  onClick={() => setPaused(true)}
                  className="w-full py-2 rounded-xl border-2 border-brand-blue text-brand-blue font-bold text-xs uppercase tracking-wide"
                  title="Finishes the current lot's upload, then stops. Click Resume to continue from where you left off."
                >
                  Pause Push
                </button>
              )}
              {!uploading && (() => {
                // Resume button appears when there are still lots left
                // to push (i.e. an earlier push was paused or interrupted).
                const unuploadedCount = lots.filter((l) =>
                  l.af_upload_status !== 'uploaded',
                ).length;
                const anyUploaded = lots.some((l) => l.af_upload_status === 'uploaded');
                if (unuploadedCount === 0 || !anyUploaded) return null;
                return (
                  <button
                    onClick={() => handleUploadToAf({ resume: true })}
                    className="w-full py-2 rounded-xl border-2 border-brand-green text-brand-green font-bold text-xs uppercase tracking-wide"
                    title={`Resume push — ${unuploadedCount} lot(s) remaining. Skips the "AF empty" confirmation; AF already has partial content from the previous push.`}
                  >
                    ▶ Resume Push ({unuploadedCount} remaining)
                  </button>
                );
              })()}
              <button
                onClick={async () => {
                  if (!confirm('Unlink AF auction? All lots will be reset to not-uploaded status and can be uploaded again.')) return;
                  await supabase.from('af_auction_map').delete().eq('auction_id', id);
                  await supabase
                    .from('lots')
                    .update({ af_upload_status: null, af_upload_error: null })
                    .eq('auction_id', id);
                  setAfLinked(false);
                  setAfAuctionId('');
                  fetchData();
                }}
                className="w-full py-2 rounded-xl border border-gray-300 text-gray-400 text-xs font-bold uppercase tracking-wide"
              >
                Unlink AF Auction
              </button>
              {lots.some((l: any) => l.af_upload_status === 'failed') && (
                <button
                  onClick={handleResetFromFailed}
                  disabled={uploading}
                  className="w-full py-2 rounded-xl border-2 border-orange-400 text-orange-500 font-bold text-xs uppercase tracking-wide disabled:opacity-50"
                >
                  Retry Failed Lots Only
                </button>
              )}
              {uploading && uploadProgress.total > 0 && (
                <ProgressBar
                  current={uploadProgress.current}
                  total={uploadProgress.total}
                  label="Uploading to AF"
                />
              )}
              {refreshing && (
                <ProgressBar
                  current={refreshProgress.current}
                  total={refreshProgress.total || 1}
                  label={refreshProgress.total > 0 ? 'Finding stock images & pricing' : 'Starting scan...'}
                />
              )}
              {uploadMsg && (
                <p className={`text-xs text-center ${uploadMsg.type === 'success' ? 'text-brand-green' : 'text-red-500'}`}>
                  {uploadMsg.text}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Search + Filter + Sort bar */}
      {lots.length > 0 && (
        <div className="px-4 mb-2 space-y-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by item name, brand, model, lot #"
            className="w-full px-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-blue"
          />
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium focus:outline-none focus:border-brand-blue"
            >
              <option value="all">All lots</option>
              <option value="not_uploaded">Not uploaded</option>
              <option value="uploaded">Uploaded to AF</option>
              <option value="failed">Failed</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium focus:outline-none focus:border-brand-blue"
            >
              <option value="lot_number">Lot # (asc)</option>
              <option value="price_desc">Price (high-low)</option>
              <option value="price_asc">Price (low-high)</option>
              <option value="confidence">Confidence</option>
            </select>
            <button
              onClick={() => {
                setBulkMode(!bulkMode);
                setSelectedLots(new Set());
              }}
              className={`px-3 py-2 rounded-lg border text-xs font-bold uppercase tracking-wide ${
                bulkMode
                  ? 'bg-brand-blue text-white border-brand-blue'
                  : 'border-gray-200 text-gray-600'
              }`}
            >
              Select
            </button>
          </div>
          {bulkMode && selectedLots.size > 0 && (
            <div className="flex gap-2 items-center bg-brand-blue/5 rounded-lg p-2 flex-wrap">
              <span className="text-xs font-bold text-brand-blue">{selectedLots.size} selected</span>
              <button
                onClick={bulkDeepRescan}
                className="ml-auto px-3 py-1 rounded text-xs font-bold text-purple-600 border border-purple-300"
              >
                Deep Rescan
              </button>
              <button
                onClick={() => setBulkEditOpen(true)}
                className="px-3 py-1 rounded text-xs font-bold text-brand-blue border border-brand-blue/30"
              >
                Edit
              </button>
              <button
                onClick={bulkDelete}
                className="px-3 py-1 rounded text-xs font-bold text-red-500 border border-red-300"
              >
                Delete
              </button>
            </div>
          )}
          <p className="text-xs text-gray-400">
            Showing {filteredLots.length} of {lots.length}
          </p>
        </div>
      )}

      {/* Auction Stats Summary */}
      {lots.length > 0 && (
        <div className="px-4 mb-3">
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Total Value</p>
              <p className="text-sm font-black text-brand-green">
                ${lots.reduce((sum, l) => sum + (Number(l.listed_price) || 0) * (l.quantity || 1), 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Uploaded</p>
              <p className="text-sm font-black text-brand-blue">
                {lots.filter((l: any) => l.af_upload_status === 'uploaded').length}/{lots.length}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Avg Price</p>
              <p className="text-sm font-black text-brand-navy">
                ${Math.round(
                  lots.reduce((sum, l) => sum + (Number(l.listed_price) || 0), 0) / lots.length
                ).toLocaleString()}
              </p>
            </div>
          </div>
          <a
            href={`/api/export?auction_id=${id}&format=csv`}
            download
            className="mt-2 block text-center text-xs font-bold text-brand-blue py-1"
          >
            Export to CSV
          </a>
        </div>
      )}

      <div className="p-4 space-y-3">
        {filteredLots.length === 0 ? (
          <p className="text-center text-gray-400 py-12">
            {lots.length === 0 ? 'No lots yet. Add your first!' : 'No lots match your filters'}
          </p>
        ) : (
          filteredLots.map((lot) => (
            <div
              key={lot.id}
              className={`bg-white rounded-xl shadow-sm border overflow-hidden ${
                selectedLots.has(lot.id) ? 'border-brand-blue' : 'border-gray-100'
              }`}
            >
              {bulkMode ? (
                <div
                  onClick={() => toggleLotSelection(lot.id)}
                  className="flex items-center p-3 gap-3 cursor-pointer active:bg-gray-50"
                >
                  <div
                    className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedLots.has(lot.id)
                        ? 'bg-brand-blue border-brand-blue'
                        : 'border-gray-300'
                    }`}
                  >
                    {selectedLots.has(lot.id) && (
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="w-12 h-12 bg-brand-navy rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-black text-sm">#{lot.lot_number}</span>
                  </div>
                  {(() => {
                    const primary = getPrimaryPhoto(lot);
                    return primary ? (
                      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                        <img
                          src={getPhotoUrl(primary.storage_path)}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : null;
                  })()}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-brand-navy text-sm truncate">{lot.item_name || 'Untitled'}</p>
                  </div>
                </div>
              ) : (
              <Link
                href={`/auctions/${id}/lots/${lot.id}/review`}
                className="flex items-center p-3 gap-3 active:bg-gray-50 transition-colors"
              >
                {/* Lot number badge */}
                <div className="w-12 h-12 bg-brand-navy rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-black text-sm">
                    #{lot.lot_number}
                  </span>
                </div>

                {/* Thumbnail */}
                {(() => {
                  const primary = getPrimaryPhoto(lot);
                  return primary ? (
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                      <img
                        src={getPhotoUrl(primary.storage_path)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : null;
                })()}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-brand-navy text-sm truncate">
                    {lot.item_name || 'Untitled'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {lot.listed_price && (
                      <span className="text-brand-green font-bold text-sm">
                        ${Number(lot.listed_price).toLocaleString()}
                      </span>
                    )}
                    {lot.quantity > 1 && (
                      <span className="bg-brand-blue/10 text-brand-blue text-xs font-bold px-1.5 py-0.5 rounded">
                        Qty {lot.quantity}
                      </span>
                    )}
                    <ConfidenceChip confidence={lot.confidence} />
                    {(lot as any).af_upload_status === 'uploaded' && (
                      <span className="bg-green-100 text-green-700 text-xs font-bold px-1.5 py-0.5 rounded">
                        AF
                      </span>
                    )}
                    {(lot as any).af_upload_status === 'failed' && (
                      <span
                        className="bg-red-100 text-red-700 text-xs font-bold px-1.5 py-0.5 rounded"
                        title={(lot as any).af_upload_error || 'Upload failed'}
                      >
                        Failed
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              )}

              {/* Delete (only show when not in bulk mode) */}
              {!bulkMode && (
              <div className="border-t border-gray-100 px-3 py-2 flex justify-end">
                <button
                  onClick={() => deleteLot(lot.id)}
                  className="text-red-400 text-xs font-medium hover:text-red-600"
                >
                  Delete
                </button>
              </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Bulk edit modal */}
      {bulkEditOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-2xl p-6 space-y-4">
            <h2 className="font-black text-brand-navy text-sm tracking-[0.1em] uppercase">
              Bulk Edit ({selectedLots.size} lots)
            </h2>

            <div>
              <label className="text-xs font-medium text-gray-400 uppercase">
                Price Multiplier (leave blank to skip)
              </label>
              <input
                type="text"
                value={bulkPriceMultiplier}
                onChange={(e) => setBulkPriceMultiplier(e.target.value)}
                placeholder="e.g. 1.1 for +10%, 0.9 for -10%"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-blue"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-400 uppercase">
                Category (leave blank to skip)
              </label>
              <input
                type="text"
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                placeholder="e.g. Refrigeration"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-blue"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-400 uppercase">
                Condition (leave blank to skip)
              </label>
              <select
                value={bulkCondition}
                onChange={(e) => setBulkCondition(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm"
              >
                <option value="">Don&apos;t change</option>
                <option value="10">10 - New in box</option>
                <option value="9">9 - Like New</option>
                <option value="8">8 - Excellent</option>
                <option value="7">7 - Good</option>
                <option value="6">6 - Average</option>
                <option value="5">5 - Well used</option>
                <option value="4">4 - Functions</option>
                <option value="3">3 - Needs parts</option>
                <option value="2">2 - Repairable</option>
                <option value="1">1 - Broken</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setBulkEditOpen(false)}
                className="flex-1 py-3 rounded-full border border-gray-200 font-bold text-gray-500 text-sm uppercase"
              >
                Cancel
              </button>
              <div className="flex-1">
                <GradientButton onClick={applyBulkEdit}>Apply</GradientButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sticky new lot button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-brand-bg via-brand-bg to-transparent pt-8">
        <Link href={`/auctions/${id}/new-lot`}>
          <GradientButton>New Lot</GradientButton>
        </Link>
      </div>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
