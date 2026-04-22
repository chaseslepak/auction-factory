"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold mb-1">Sign in</h1>
        <p className="text-sm text-brand-muted mb-4">
          We&apos;ll email you a magic link.
        </p>

        {sent ? (
          <p className="text-sm">
            Check <span className="font-medium">{email}</span> for a sign-in link.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="label" htmlFor="email">Work email</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
