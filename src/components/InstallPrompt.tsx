'use client';

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'install-prompt-dismissed-v1';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      return;
    }

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (standalone) return;

    const ua = window.navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) && !(window as any).MSStream;
    const isAndroid = /Android/.test(ua);
    if (!isIOS && !isAndroid) return;

    if (isIOS) {
      setPlatform('ios');
      setVisible(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setPlatform('android');
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {}
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  };

  return (
    <div className="mb-4 rounded-2xl border-2 border-brand-green/30 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/af-mark.png"
            alt=""
            className="w-10 h-10 rounded-lg flex-shrink-0"
          />
          <h3 className="font-black text-brand-navy text-sm uppercase tracking-wide">
            Install the lotter
          </h3>
        </div>
        <button
          onClick={dismiss}
          className="text-gray-400 text-lg leading-none flex-shrink-0"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>

      {platform === 'ios' ? (
        <div className="mt-3 space-y-2 text-sm text-gray-600 leading-relaxed">
          <p>Add to your home screen so it opens fullscreen like a real app:</p>
          <p>
            1. Tap the <span className="font-bold">Share</span> button{' '}
            <span className="inline-block align-middle">
              <svg
                className="w-4 h-4 inline"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 6l4-4m0 0l4 4m-4-4v13m-8 0h16"
                />
              </svg>
            </span>{' '}
            at the bottom of Safari.
          </p>
          <p>
            2. Scroll down and tap{' '}
            <span className="font-bold">Add to Home Screen</span>.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-gray-600 leading-relaxed">
            Install the app on your home screen so it opens fullscreen and works
            offline.
          </p>
          <button
            onClick={install}
            className="w-full py-2.5 rounded-full bg-brand-green text-white font-black text-xs uppercase tracking-wide"
          >
            Install
          </button>
        </div>
      )}
    </div>
  );
}
