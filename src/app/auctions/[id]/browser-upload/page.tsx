'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';

interface Preview {
  total: number;
  first?: number;
  last?: number;
  missing?: number[];
}

export default function BrowserUploadPage() {
  const { id } = useParams<{ id: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [lotsRange, setLotsRange] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateToken = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/browser-upload/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auction_id: id }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setToken(data.token);
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  // Preview what the export would return with the current token + range
  const runPreview = async () => {
    if (!token) return;
    setPreviewing(true);
    setPreview(null);
    setError(null);
    try {
      const url =
        `${origin}/api/browser-upload/export?token=${encodeURIComponent(token)}` +
        (lotsRange.trim() ? `&lots=${encodeURIComponent(lotsRange.trim())}` : '');
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      const nums = (data.lots || []).map((l: any) => l.lot_number);
      setPreview({
        total: data.lots?.length || 0,
        first: nums[0],
        last: nums[nums.length - 1],
        missing: data.missing,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPreviewing(false);
    }
  };

  // Auto-preview when token appears or the range changes
  useEffect(() => {
    if (!token) {
      setPreview(null);
      return;
    }
    const t = setTimeout(runPreview, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, lotsRange]);

  const loaderUrl = token
    ? `${origin}/api/browser-upload/script?token=${encodeURIComponent(token)}` +
      (lotsRange.trim() ? `&lots=${encodeURIComponent(lotsRange.trim())}` : '')
    : '';
  // Use a <script> tag rather than fetch + eval. Cross-origin fetch +
  // eval hits Safari's ITP / cross-origin-body-read protections
  // intermittently and returns empty text — eval("") throws
  // "SyntaxError: Unexpected EOF" and the upload never starts.
  // Script tag loads bypass CORS entirely.
  const loaderScript = loaderUrl
    ? `var s=document.createElement('script');s.src='${loaderUrl}';document.head.appendChild(s);`
    : '';

  const copyScript = async () => {
    if (!loaderScript) return;
    try {
      await navigator.clipboard.writeText(loaderScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="min-h-screen bg-brand-bg pb-8">
      <Header title="Browser Upload" backHref={`/auctions/${id}`} />

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-2">
            Upload from your browser
          </h2>
          <p className="text-sm text-gray-600 mb-3">
            This method uploads lots to AF directly from your logged-in browser, bypassing
            AF&apos;s bot protection entirely. Near 100% success rate.
          </p>
          <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
            <li>Log into <strong>auctionfactory.com/admin</strong> in Chrome (or Safari)</li>
            <li>Navigate to any page inside /admin (e.g. auctions.php)</li>
            <li>Open developer console: <strong>Cmd+Option+J</strong> (Mac) or <strong>F12</strong> (Windows)</li>
            <li>Click &quot;Generate Script&quot; below, copy it, and paste into the console</li>
            <li>Press Enter — a status window appears in the top right and uploads begin</li>
            <li>Leave the AF tab open until it shows DONE</li>
          </ol>
        </div>

        {!token ? (
          <button
            onClick={generateToken}
            disabled={loading}
            className="w-full gradient-btn text-white font-black text-sm uppercase tracking-wide py-4 rounded-full disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate Script'}
          </button>
        ) : (
          <>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
              <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide">
                Optional: lot range
              </h3>
              <p className="text-xs text-gray-500">
                Leave blank to push every lot not yet uploaded. Or specify exact numbers to
                push — ignores the &ldquo;already uploaded&rdquo; flag. Format:{' '}
                <code className="text-brand-blue">183-227,249-279,251</code>.
              </p>
              <input
                type="text"
                value={lotsRange}
                onChange={(e) => setLotsRange(e.target.value)}
                placeholder="e.g. 183-227"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-blue"
              />
              {previewing ? (
                <p className="text-xs text-gray-400">Previewing…</p>
              ) : preview ? (
                <div className="text-xs">
                  {preview.total === 0 ? (
                    <p className="text-red-600">
                      Nothing to push{lotsRange.trim() ? ` for range "${lotsRange.trim()}"` : ''}.
                    </p>
                  ) : (
                    <p className="text-brand-navy">
                      Will push <strong>{preview.total}</strong> lot
                      {preview.total === 1 ? '' : 's'}
                      {preview.first != null && (
                        <>
                          {' '}(<strong>#{preview.first}</strong>
                          {preview.last != null && preview.last !== preview.first && (
                            <>
                              {' → '}<strong>#{preview.last}</strong>
                            </>
                          )})
                        </>
                      )}
                    </p>
                  )}
                  {preview.missing && preview.missing.length > 0 && (
                    <p className="text-yellow-700 mt-1">
                      Requested but not in lotter: {preview.missing.join(', ')}
                    </p>
                  )}
                </div>
              ) : null}
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-2">
                Script ready — valid 24 hours
              </h3>
              <button
                onClick={copyScript}
                disabled={!preview || preview.total === 0}
                className="w-full py-3 rounded-lg bg-brand-green text-white font-bold text-sm uppercase tracking-wide mb-3 disabled:opacity-50"
              >
                {copied ? '✓ Copied to clipboard' : 'Copy Script'}
              </button>
              <details>
                <summary className="text-xs text-gray-400 cursor-pointer">Show raw script</summary>
                <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-auto max-h-60 font-mono">
                  {loaderScript}
                </pre>
              </details>
            </div>
            <button
              onClick={() => {
                setToken(null);
                setPreview(null);
                setLotsRange('');
              }}
              className="w-full py-2 text-xs font-bold text-gray-400"
            >
              Generate new token
            </button>
          </>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
