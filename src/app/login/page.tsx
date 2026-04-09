'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import GradientButton from '@/components/GradientButton';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const authError = searchParams.get('error');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    if (signInError) {
      setError(signInError.message);
    } else {
      setSent(true);
    }
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

      {/* Auth error */}
      {authError === 'not_authorized' && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 text-sm rounded-lg px-4 py-3 mb-4 w-full max-w-sm text-center">
          Your email is not authorized. Contact your administrator.
        </div>
      )}

      {/* Form */}
      <div className="w-full max-w-sm">
        {sent ? (
          <div className="bg-brand-green/10 border border-brand-green text-brand-green text-sm rounded-lg px-4 py-6 text-center">
            <p className="font-bold mb-1">Check your email</p>
            <p className="text-green-300">
              We sent a magic link to <strong>{email}</strong>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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
