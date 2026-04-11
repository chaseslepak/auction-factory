'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';

export default function BrowserUploadPage() {
  const { id } = useParams<{ id: string }>();
  const [token, setToken] = useState<string | null>(null);
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

  // Loader loaderScript: downloads the full loaderScript from our server and runs it.
  // This keeps what the user pastes short and always up-to-date.
  const loaderScript = token
    ? `fetch('${origin}/api/browser-upload/loaderScript?token=${token}').then(r=>r.text()).then(eval);`
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
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-2">
                Script ready — valid 24 hours
              </h3>
              <button
                onClick={copyScript}
                className="w-full py-3 rounded-lg bg-brand-green text-white font-bold text-sm uppercase tracking-wide mb-3"
              >
                {copied ? '✓ Copied to clipboard' : 'Copy Script'}
              </button>
              <details>
                <summary className="text-xs text-gray-400 cursor-pointer">Show raw loaderScript</summary>
                <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-auto max-h-60 font-mono">
                  {loaderScript}
                </pre>
              </details>
            </div>
            <button
              onClick={() => setToken(null)}
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
