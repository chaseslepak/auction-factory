'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import GradientButton from '@/components/GradientButton';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'magic' | 'password'>('magic');
  const searchParams = useSearchParams();
  const router = useRouter();
  const authError = searchParams.get('error');
  const authMsg = searchParams.get('msg');

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signInError) {
        // If rate limited, suggest password login
        if (signInError.message.toLowerCase().includes('rate') || signInError.message.toLowerCase().includes('limit')) {
          setError('Email rate limited. Try password login below, or wait 15 minutes.');
          setMode('password');
        } else {
          setError(signInError.message);
        }
      } else {
        setSent(true);
      }
    } catch (err: any) {
      setError(`Request failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        if (signInError.message.includes('Invalid login credentials')) {
          // Maybe they haven't set a password yet — offer to send a reset
          setError('No password set yet. Click "Set Password" to create one via email.');
        } else {
          setError(signInError.message);
        }
      } else {
        router.push('/auctions');
      }
    } catch (err: any) {
      setError(`Request failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError('Enter your email first');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auctions`,
      });
      if (error) {
        setError(error.message);
      } else {
        setSent(true);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-brand-navy flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="w-16 h-16 gradient-btn rounded-xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14.22 6.157l2.747-4.12a.674.674 0 011.12 0l2.747 4.12c.135.202.112.47-.056.646l-5.502 5.784a.674.674 0 01-.977 0L8.797 6.803a.5.5 0 01-.056-.646L11.488 2.037a.674.674 0 011.12 0l1.612 4.12z" />
            <path d="M5 17h14v2H5zm0 4h14v2H5z" />
          </svg>
        </div>
        <h1 className="text-white font-black text-lg tracking-[0.2em] uppercase">
          Auction Factory
        </h1>
        <p className="text-gray-400 text-sm tracking-[0.15em] uppercase mt-1">
          Ohio Lotter
        </p>
      </div>

      {/* Auth errors */}
      {authError === 'not_authorized' && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 text-sm rounded-lg px-4 py-3 mb-4 w-full max-w-sm text-center">
          Your email is not authorized. Contact your administrator.
        </div>
      )}
      {authError === 'auth_failed' && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 text-sm rounded-lg px-4 py-3 mb-4 w-full max-w-sm text-center">
          Login failed{authMsg ? `: ${authMsg}` : ''}. Try again.
        </div>
      )}

      {/* Form */}
      <div className="w-full max-w-sm">
        {sent ? (
          <div className="bg-brand-green/10 border border-brand-green text-brand-green text-sm rounded-lg px-4 py-6 text-center">
            <p className="font-bold mb-1">Check your email</p>
            <p className="text-green-300">
              We sent a link to <strong>{email}</strong>
            </p>
          </div>
        ) : mode === 'magic' ? (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-brand-green"
            />
            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}
            <GradientButton type="submit" loading={loading}>
              Send Magic Link
            </GradientButton>
            <button
              type="button"
              onClick={() => setMode('password')}
              className="w-full text-center text-gray-400 text-sm hover:text-white"
            >
              Use password instead
            </button>
          </form>
        ) : (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-brand-green"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-brand-green"
            />
            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}
            <GradientButton type="submit" loading={loading}>
              Log In
            </GradientButton>
            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setMode('magic')}
                className="text-gray-400 text-sm hover:text-white"
              >
                Use magic link
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                className="text-brand-green text-sm hover:text-green-300"
              >
                Set Password
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
