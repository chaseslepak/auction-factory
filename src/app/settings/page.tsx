'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import GradientButton from '@/components/GradientButton';
import { CL_REGIONS } from '@/lib/platform-types';

export default function SettingsPage() {
  const [cookie, setCookie] = useState('');
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Facebook Business Page state
  const [fbPageId, setFbPageId] = useState('');
  const [fbAccessToken, setFbAccessToken] = useState('');
  const [fbConnected, setFbConnected] = useState(false);
  const [fbPageName, setFbPageName] = useState('');
  const [fbLoading, setFbLoading] = useState(false);
  const [fbMessage, setFbMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Craigslist state
  const [clRegions, setClRegions] = useState<string[]>(['cleveland']);
  const [clSaving, setClSaving] = useState(false);
  const [clMessage, setClMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    checkSession();
    checkFbStatus();
    loadClConfig();
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

  const checkFbStatus = async () => {
    try {
      const res = await fetch('/api/fb/auth-status');
      const data = await res.json();
      setFbConnected(data.connected);
      setFbPageName(data.pageName || '');
    } catch {}
  };

  const handleFbSave = async () => {
    if (!fbPageId.trim() || !fbAccessToken.trim()) return;
    setFbLoading(true);
    setFbMessage(null);

    try {
      const res = await fetch('/api/platform-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'fb_page',
          config: {
            page_id: fbPageId.trim(),
            page_access_token: fbAccessToken.trim(),
          },
          enabled: true,
        }),
      });

      if (res.ok) {
        setFbMessage({ type: 'success', text: 'Facebook page saved! Testing connection...' });
        setFbPageId('');
        setFbAccessToken('');
        await checkFbStatus();
        if (fbConnected) {
          setFbMessage({ type: 'success', text: `Connected to ${fbPageName}!` });
        }
      } else {
        const data = await res.json();
        setFbMessage({ type: 'error', text: data.error });
      }
    } catch (err: any) {
      setFbMessage({ type: 'error', text: err.message });
    }

    setFbLoading(false);
  };

  const loadClConfig = async () => {
    try {
      const res = await fetch('/api/platform-config?platform=craigslist');
      const data = await res.json();
      if (data.config?.regions) {
        setClRegions(data.config.regions);
      }
    } catch {}
  };

  const handleClSave = async () => {
    setClSaving(true);
    setClMessage(null);

    try {
      const res = await fetch('/api/platform-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'craigslist',
          config: { regions: clRegions },
          enabled: true,
        }),
      });

      if (res.ok) {
        setClMessage({ type: 'success', text: 'Craigslist regions saved!' });
      } else {
        const data = await res.json();
        setClMessage({ type: 'error', text: data.error });
      }
    } catch (err: any) {
      setClMessage({ type: 'error', text: err.message });
    }

    setClSaving(false);
  };

  const toggleClRegion = (region: string) => {
    setClRegions((prev) =>
      prev.includes(region) ? prev.filter((r) => r !== region) : [...prev, region]
    );
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

        {/* Facebook Business Page */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-3">
            Facebook Business Page
          </h2>

          {fbConnected ? (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-brand-green" />
                <span className="text-brand-green font-bold text-sm">
                  Connected to {fbPageName}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                To update, paste new credentials below.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <span className="text-red-400 font-bold text-sm">Not Connected</span>
            </div>
          )}

          <div className="bg-brand-bg rounded-lg p-3 mb-4">
            <p className="text-xs text-gray-600 font-medium mb-2">Setup instructions:</p>
            <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
              <li>Go to developers.facebook.com and create an app (Business type)</li>
              <li>Add the &quot;Pages&quot; product and request pages_manage_posts permission</li>
              <li>In Graph API Explorer, select your page and generate a Page Access Token</li>
              <li>Extend the token to a long-lived token (60-day or permanent via system user)</li>
              <li>Paste your Page ID and Access Token below</li>
            </ol>
          </div>

          <input
            type="text"
            value={fbPageId}
            onChange={(e) => setFbPageId(e.target.value)}
            placeholder="Facebook Page ID (e.g., 123456789)"
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:border-brand-blue text-sm mb-2"
          />

          <textarea
            value={fbAccessToken}
            onChange={(e) => setFbAccessToken(e.target.value)}
            placeholder="Page Access Token (starts with EAA...)"
            rows={2}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:border-brand-blue text-sm font-mono resize-none"
          />

          {fbMessage && (
            <p className={`text-sm mt-2 ${fbMessage.type === 'success' ? 'text-brand-green' : 'text-red-500'}`}>
              {fbMessage.text}
            </p>
          )}

          <div className="mt-3">
            <GradientButton
              onClick={handleFbSave}
              loading={fbLoading}
              disabled={!fbPageId.trim() || !fbAccessToken.trim()}
            >
              Save Facebook Connection
            </GradientButton>
          </div>
        </div>

        {/* Craigslist Regions */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-3">
            Craigslist Regions
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Select which Ohio Craigslist regions to post to. Listings will be generated for each selected region.
          </p>

          <div className="space-y-2">
            {Object.entries(CL_REGIONS).map(([key, { name }]) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clRegions.includes(key)}
                  onChange={() => toggleClRegion(key)}
                  className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
                />
                <span className="text-sm text-gray-700">{name}</span>
              </label>
            ))}
          </div>

          {clMessage && (
            <p className={`text-sm mt-2 ${clMessage.type === 'success' ? 'text-brand-green' : 'text-red-500'}`}>
              {clMessage.text}
            </p>
          )}

          <div className="mt-3">
            <GradientButton onClick={handleClSave} loading={clSaving} disabled={clRegions.length === 0}>
              Save Regions
            </GradientButton>
          </div>
        </div>
      </div>
    </div>
  );
}
