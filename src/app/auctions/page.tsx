'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Auction } from '@/lib/types';
import Header from '@/components/Header';
import GradientButton from '@/components/GradientButton';

export default function AuctionsPage() {
  const [auctions, setAuctions] = useState<(Auction & { lot_count: number })[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchAuctions = async () => {
    const { data } = await supabase
      .from('auctions')
      .select('*, lots(count)')
      .order('created_at', { ascending: false });

    if (data) {
      setAuctions(
        data.map((a: any) => ({
          ...a,
          lot_count: a.lots?.[0]?.count ?? 0,
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAuctions();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    await supabase.from('auctions').insert({ name: newName.trim() });
    setNewName('');
    setShowForm(false);
    fetchAuctions();
  };

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header title="Auctions" />

      <div className="p-4 space-y-3">
        {loading ? (
          <p className="text-center text-gray-400 py-12">Loading...</p>
        ) : auctions.length === 0 ? (
          <p className="text-center text-gray-400 py-12">
            No auctions yet. Create your first!
          </p>
        ) : (
          auctions.map((auction) => (
            <Link
              key={auction.id}
              href={`/auctions/${auction.id}`}
              className="block bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-brand-navy">{auction.name}</h2>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {auction.lot_count} lot{auction.lot_count !== 1 ? 's' : ''}
                  </p>
                </div>
                <svg
                  className="w-5 h-5 text-gray-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Inline create form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <form
            onSubmit={handleCreate}
            className="bg-white w-full rounded-t-2xl p-6 space-y-4"
          >
            <h2 className="font-black text-brand-navy text-sm tracking-[0.1em] uppercase">
              New Auction
            </h2>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Auction name"
              autoFocus
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:border-brand-blue"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-3 rounded-full border border-gray-200 font-bold text-gray-500 text-sm uppercase tracking-wide"
              >
                Cancel
              </button>
              <div className="flex-1">
                <GradientButton type="submit">Create</GradientButton>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Sticky bottom button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-brand-bg via-brand-bg to-transparent pt-8">
        <GradientButton onClick={() => setShowForm(true)}>
          New Auction
        </GradientButton>
      </div>
    </div>
  );
}
