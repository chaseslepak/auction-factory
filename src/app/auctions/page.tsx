'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Auction } from '@/lib/types';
import Header from '@/components/Header';
import GradientButton from '@/components/GradientButton';

export default function AuctionsPage() {
  const [auctions, setAuctions] = useState<(Auction & { lot_count: number; archived_at?: string | null })[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
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

  const logActivity = async (action: string, entity_id?: string, auction_id?: string, details?: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;
    await supabase.from('activity_log').insert({
      user_email: user.email,
      action,
      entity_type: 'auction',
      entity_id,
      auction_id,
      details: details || {},
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const { data } = await supabase
      .from('auctions')
      .insert({ name: newName.trim() })
      .select()
      .single();

    if (data) {
      logActivity('created', data.id, data.id, { name: newName.trim() });
    }

    setNewName('');
    setShowForm(false);
    fetchAuctions();
  };

  const toggleArchive = async (auctionId: string, isArchived: boolean) => {
    await supabase
      .from('auctions')
      .update({ archived_at: isArchived ? null : new Date().toISOString() })
      .eq('id', auctionId);
    logActivity(isArchived ? 'unarchived' : 'archived', auctionId, auctionId);
    fetchAuctions();
  };

  const visibleAuctions = auctions.filter((a) => showArchived ? !!a.archived_at : !a.archived_at);
  const archivedCount = auctions.filter((a) => !!a.archived_at).length;

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header title="Auctions" />

      <div className="px-4 py-2 flex items-center justify-between">
        <button
          onClick={() => setShowArchived(!showArchived)}
          className="text-xs font-medium text-brand-blue"
        >
          {showArchived ? `← Back to Active` : `View Archived (${archivedCount})`}
        </button>
        <Link href="/admin" className="text-xs text-brand-blue font-medium">
          Admin
        </Link>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <p className="text-center text-gray-400 py-12">Loading...</p>
        ) : visibleAuctions.length === 0 ? (
          <p className="text-center text-gray-400 py-12">
            {showArchived ? 'No archived auctions' : 'No auctions yet. Create your first!'}
          </p>
        ) : (
          visibleAuctions.map((auction) => (
            <div
              key={auction.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
            >
              <Link
                href={`/auctions/${auction.id}`}
                className="block p-4 active:bg-gray-50 transition-colors"
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
              <div className="border-t border-gray-100 px-4 py-2 flex justify-end">
                <button
                  onClick={() => toggleArchive(auction.id, !!auction.archived_at)}
                  className="text-xs text-gray-400 font-medium hover:text-brand-blue"
                >
                  {auction.archived_at ? 'Restore' : 'Archive'}
                </button>
              </div>
            </div>
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
