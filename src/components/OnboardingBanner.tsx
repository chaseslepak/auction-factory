'use client';

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'onboarding-banner-dismissed-v1';

// One-time dismissible card explaining the lotter -> HQ upload flow.
// Bumping the version suffix on DISMISS_KEY re-shows the banner to
// everyone (use if the workflow changes materially).
export default function OnboardingBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(DISMISS_KEY)) setVisible(true);
    } catch {}
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {}
    setVisible(false);
  };

  return (
    <div className="mb-4 rounded-2xl border-2 border-brand-blue/30 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-black text-brand-navy text-sm uppercase tracking-wide">
          Welcome to the Auction Factory Official Lotter
        </h3>
        <button
          onClick={dismiss}
          className="text-gray-400 text-lg leading-none flex-shrink-0"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="mt-3 space-y-2 text-sm text-gray-600 leading-relaxed">
        <p>
          <span className="font-bold text-brand-navy">1.</span>{' '}
          <span className="font-bold">Open an auction</span> (or create a new one) and add lots.
        </p>
        <p>
          <span className="font-bold text-brand-navy">2.</span>{' '}
          <span className="font-bold">Photograph items</span> — the AI writes the listing from your photos.
          Take clear, well-lit shots for the best results.
        </p>
        <p>
          <span className="font-bold text-brand-navy">3.</span> When lotting is done, click{' '}
          <span className="font-bold text-brand-green-dark">Mark Ready for HQ</span> on the
          auction page. HQ will push it to Auction Factory.
        </p>
        <p className="text-xs text-gray-500 pt-1 border-t border-gray-100 mt-3">
          <span className="font-bold">Lotting with a partner?</span> Each person picks their own
          starting lot number on the new-lot page (&quot;Change start&quot;) so you don&apos;t collide.
        </p>
      </div>
      <button
        onClick={dismiss}
        className="mt-3 text-xs font-bold text-brand-blue uppercase tracking-wide"
      >
        Got it →
      </button>
    </div>
  );
}
