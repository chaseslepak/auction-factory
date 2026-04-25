'use client';

import { useState, useTransition } from 'react';
import { signInWithOtp } from '@/lib/chase/actions/auth';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await signInWithOtp(fd);
      if ('error' in res && res.error) {
        setStatus('error');
        setError(res.error);
      } else {
        setStatus('sent');
      }
    });
  }

  if (status === 'sent') {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
        Magic link sent to <strong>{email}</strong>. Check your inbox.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-slate-600">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-blue focus:outline-none"
          placeholder="you@example.com"
        />
      </label>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-navy py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Send magic link'}
      </button>
      <p className="text-center text-[11px] text-slate-400">
        We&apos;ll email you a one-time sign-in link.
      </p>
    </form>
  );
}
