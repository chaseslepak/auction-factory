'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import GradientButton from '@/components/GradientButton';

export default function SettingsPage() {
  const [cookie, setCookie] = useState('');
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/af-session');
      const data = await res.json();
      setConnected(data.connected);
      setLastUpdated(data.updated_at || null);
    } catch {
      setConnected(false);
    }
    setChecking(false);
  };

  const handleSave = async () => {
    if (!cookie.trim()) return;
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/af-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_cookie: cookie.trim() }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ type: 'success', text: 'Connected to Auction Factory!' });
        setConnected(true);
        setCookie('');
        checkSession();
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header title="Settings" backHref="/auctions" />

      <div className="p-4 space-y-6">
        {/* AF Connection Status */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-3">
            Auction Factory Connection
          </h2>

          {checking ? (
            <p className="text-gray-400 text-sm">Checking connection...</p>
          ) : connected ? (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-brand-green" />
                <span className="text-brand-green font-bold text-sm">Connected</span>
              </div>
              {lastUpdated && (
                <p className="text-xs text-gray-400">
                  Last updated: {new Date(lastUpdated).toLocaleString()}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-2">
                To refresh the session, paste a new cookie below.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <span className="text-red-400 font-bold text-sm">Not Connected</span>
            </div>
          )}
        </div>

        {/* Cookie Input */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-3">
            Connect to AF
          </h2>

          <div className="bg-brand-bg rounded-lg p-3 mb-4">
            <p className="text-xs text-gray-600 font-medium mb-2">How to get your session cookie:</p>
            <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
              <li>
                Log into{' '}
                <a
                  href="https://www.auctionfactory.com/admin/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-blue underline"
                >
                  auctionfactory.com/admin
                </a>{' '}
                in a new tab
              </li>
              <li>Once logged in, open the browser console (F12 &gt; Console)</li>
              <li>
                Type: <code className="bg-gray-200 px-1 rounded">document.cookie</code> and press Enter
              </li>
              <li>Copy the entire result and paste it below</li>
            </ol>
          </div>

          <textarea
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            placeholder='Paste your AF cookie here (e.g. PHPSESSID=abc123...)'
            rows={3}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:border-brand-blue text-sm font-mono resize-none"
          />

          {message && (
            <p className={`text-sm mt-2 ${message.type === 'success' ? 'text-brand-green' : 'text-red-500'}`}>
              {message.text}
            </p>
          )}

          <div className="mt-3">
            <GradientButton onClick={handleSave} loading={loading} disabled={!cookie.trim()}>
              Save Connection
            </GradientButton>
          </div>
        </div>
      </div>
    </div>
  );
}
