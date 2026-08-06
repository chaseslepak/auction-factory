import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/browser-upload-cors';

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request, 'GET, OPTIONS') });
}

// Serve the browser upload script with token baked in
export async function GET(request: NextRequest) {
  const CORS_HEADERS = corsHeaders(request, 'GET, OPTIONS');
  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    return new NextResponse('// token required', {
      status: 400,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8', ...CORS_HEADERS },
    });
  }

  const origin = request.nextUrl.origin;

  const script = `// Auction Factory Browser Upload - Token: ${token.substring(0, 8)}...
(async () => {
  const TOKEN = '${token}';
  const API = '${origin}';

  // Create status UI
  const existing = document.getElementById('au-upload-status');
  if (existing) existing.remove();
  const ui = document.createElement('div');
  ui.id = 'au-upload-status';
  ui.style.cssText = 'position:fixed;top:16px;right:16px;background:#0A1628;color:white;padding:20px;z-index:999999;border-radius:12px;font-family:-apple-system,sans-serif;font-size:14px;max-width:340px;box-shadow:0 10px 40px rgba(0,0,0,0.4);border:2px solid #5CB82C';
  ui.innerHTML = '<div id="au-status-title" style="font-weight:bold;margin-bottom:8px">Auction Factory Browser Upload</div><div id="au-status-msg">Fetching lot data...</div><div id="au-status-bar" style="margin-top:10px;height:6px;background:#1a2a3e;border-radius:3px;overflow:hidden"><div id="au-status-fill" style="height:100%;width:0%;background:linear-gradient(90deg,#1E50B5,#5CB82C);transition:width 0.3s"></div></div><div id="au-status-sub" style="margin-top:8px;font-size:11px;color:#9ca3af"></div>';
  document.body.appendChild(ui);

  const setMsg = (msg, sub = '') => {
    document.getElementById('au-status-msg').textContent = msg;
    document.getElementById('au-status-sub').textContent = sub;
  };
  const setProgress = (pct) => {
    document.getElementById('au-status-fill').style.width = pct + '%';
  };

  try {
    // Fetch lot data
    const res = await fetch(API + '/api/browser-upload/export?token=' + TOKEN);
    if (!res.ok) {
      const errText = await res.text();
      setMsg('ERROR: ' + errText.substring(0, 200));
      return;
    }
    const data = await res.json();
    if (data.error) {
      setMsg('ERROR: ' + data.error);
      return;
    }
    if (!data.lots || data.lots.length === 0) {
      setMsg('No lots to upload', 'All lots already uploaded');
      return;
    }

    const afAuc = data.af_auction_id;
    const lots = data.lots;
    setMsg('Got ' + lots.length + ' lots', 'Loading AF form...');

    // Fetch the add_item form to get hidden fields
    const formUrl = '/admin/add_item_2new.php?auction=' + afAuc;
    const fr = await fetch(formUrl, { credentials: 'include' });
    if (!fr.ok) {
      setMsg('Failed to load AF form', 'Make sure you are logged in to AF admin');
      return;
    }
    const fh = await fr.text();
    const getHidden = (n) => {
      const m = fh.match(new RegExp('name="' + n + '"[^>]*value="([^"]*)"'));
      return m ? m[1] : '';
    };
    const hidden = {
      auction: getHidden('auction'),
      auction_id: getHidden('auction_id'),
      end_date: getHidden('end_date'),
      end_time: getHidden('end_time'),
      auto_extend: getHidden('auto_extend'),
      staggered: getHidden('staggered'),
    };

    if (!hidden.auction) {
      setMsg('Could not read AF form', 'Are you logged in to auctionfactory.com/admin?');
      return;
    }

    let ok = 0;
    let fail = 0;
    const failedLots = [];

    for (let i = 0; i < lots.length; i++) {
      const lot = lots[i];
      setMsg('Uploading ' + (i + 1) + '/' + lots.length + ' (Lot #' + lot.lot_number + ')', ok + ' uploaded, ' + fail + ' failed');
      setProgress(((i) / lots.length) * 100);

      try {
        const fd = new FormData();
        Object.entries(hidden).forEach(([k, v]) => fd.append(k, v));
        Object.entries(lot.fields).forEach(([k, v]) => fd.append(k, v));
        const isLast = i === lots.length - 1;
        if (isLast) {
          fd.append('exit', 'Save & Exit');
        } else {
          fd.append('next', 'Next Item');
        }

        // Download and attach photos
        for (let j = 0; j < lot.photos.length; j++) {
          try {
            const pr = await fetch(lot.photos[j]);
            if (pr.ok) {
              const pb = await pr.blob();
              fd.append('file[]', pb, 'photo_' + j + '.jpg');
            }
          } catch (e) {
            console.warn('Photo download failed:', e);
          }
        }

        // POST to AF form (same-origin, uses your real session)
        const ur = await fetch(formUrl, {
          method: 'POST',
          body: fd,
          credentials: 'include',
        });
        const ut = await ur.text();

        // Detect success. Old check ("response contains 'Item Name'") gave
        // false positives when AF silently re-served the same empty form on
        // rejection. We now require a stronger positive signal:
        //   (1) fetch was redirected (AF redirects to a fresh form on save), OR
        //   (2) response contains a known success phrase.
        // Then we still check for known failure signals as a veto.
        const lower = ut.toLowerCase();
        const redirected = ur.redirected;
        const finalUrl = ur.url;
        const responseLen = ut.length;

        const positiveSignal =
          redirected ||
          lower.includes('successfully added') ||
          lower.includes('item added') ||
          lower.includes('item saved') ||
          lower.includes('saved successfully');

        const negativeSignal =
          ur.status !== 200 ||
          ut.includes('Forbidden') ||
          ut.includes('psEmail') ||
          ut.includes("don't have permission") ||
          lower.includes('please enter') ||
          lower.includes('is required') ||
          lower.includes('error');

        const success = positiveSignal && !negativeSignal;

        // Verbose diagnostics for the first 3 uploads so we can see what
        // AF is actually returning. After that, only log on failure.
        const shouldLog = i < 3 || !success;
        if (shouldLog) {
          console.log('[AU] lot #' + lot.lot_number + ' ->', {
            status: ur.status,
            redirected,
            finalUrl,
            responseLen,
            positiveSignal,
            negativeSignal,
            snippet: ut.substring(0, 500),
          });
        }

        // Show the first response in the on-page status panel so the user
        // doesn't have to open DevTools to see what's going on.
        if (i === 0) {
          const dbg = document.createElement('div');
          dbg.style.cssText = 'margin-top:8px;padding:6px;background:#0f1e33;border-radius:6px;font-family:monospace;font-size:10px;color:#9ca3af;max-height:120px;overflow:auto;word-break:break-all';
          dbg.textContent =
            'Lot #' + lot.lot_number + ' -> status=' + ur.status +
            ', redirected=' + redirected +
            ', len=' + responseLen +
            ', success=' + success + '\n' +
            'finalUrl=' + finalUrl + '\n\n' +
            ut.substring(0, 400);
          ui.appendChild(dbg);
        }

        // If the FIRST upload failed, stop the whole batch immediately so
        // we don't mark 49 lots as uploaded on a systemic failure.
        if (i === 0 && !success) {
          setMsg(
            'FIRST LOT FAILED - stopping to avoid marking rest as uploaded.',
            'Check the diagnostic panel + browser console; share with support.'
          );
          fail++;
          failedLots.push(lot.lot_number);
          await fetch(API + '/api/browser-upload/mark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: TOKEN,
              lot_id: lot.id,
              status: 'failed',
              error: 'Browser upload aborted - first lot failed (status ' + ur.status +
                     ', redirected=' + redirected + ', len=' + responseLen + ')',
            }),
          });
          return;
        }

        // Update lotter status
        await fetch(API + '/api/browser-upload/mark', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: TOKEN,
            lot_id: lot.id,
            status: success ? 'uploaded' : 'failed',
            error: success ? null : 'Browser upload failed - status ' + ur.status +
                                     ' (redirected=' + redirected + ', len=' + responseLen + ')',
          }),
        });

        if (success) {
          ok++;
        } else {
          fail++;
          failedLots.push(lot.lot_number);
        }
      } catch (e) {
        fail++;
        failedLots.push(lot.lot_number);
        console.error('[AU] Lot #' + lot.lot_number + ' error:', e);
      }

      // Short delay between uploads (be gentle to AF)
      await new Promise((r) => setTimeout(r, 1000));
    }

    setProgress(100);
    setMsg(
      'DONE! ' + ok + ' uploaded, ' + fail + ' failed',
      failedLots.length > 0 ? 'Failed lots: ' + failedLots.join(', ') : 'All uploaded successfully'
    );
  } catch (err) {
    setMsg('ERROR: ' + err.message);
    console.error(err);
  }
})();`;

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}
