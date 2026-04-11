'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Header from '@/components/Header';

interface ActivityEntry {
  id: string;
  user_email: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  auction_id: string | null;
  details: any;
  created_at: string;
}

export default function ActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState('');
  const supabase = createClient();

  useEffect(() => {
    const fetch = async () => {
      let query = supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (filterUser) query = query.eq('user_email', filterUser);
      const { data } = await query;
      if (data) setEntries(data as any);
      setLoading(false);
    };
    fetch();
  }, [filterUser]);

  const users = Array.from(new Set(entries.map((e) => e.user_email))).sort();

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header title="Activity Log" backHref="/admin" />

      <div className="p-4">
        {users.length > 0 && (
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm mb-3"
          >
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        )}

        {loading ? (
          <p className="text-center text-gray-400 py-12">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No activity yet</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-brand-navy">
                      <span className="font-bold">{entry.user_email}</span>
                      {' '}<span className="text-gray-500">{entry.action}</span>
                      {' '}<span className="text-gray-400">{entry.entity_type}</span>
                    </p>
                    {entry.details && Object.keys(entry.details).length > 0 && (
                      <p className="text-xs text-gray-400 mt-1 font-mono">
                        {JSON.stringify(entry.details).substring(0, 150)}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
