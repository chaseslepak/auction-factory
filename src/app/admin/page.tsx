'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Header from '@/components/Header';

const sections = [
  { href: '/admin/hq-upload-queue', title: 'HQ Upload Queue', desc: 'Auctions locations have marked ready — push to AF here' },
  { href: '/admin/sop', title: 'SOP / Manual', desc: 'How to use the Auction Factory Official Lotter — step by step guide' },
  { href: '/admin/jobs', title: 'Jobs', desc: 'View background job status, errors, retry failed' },
  { href: '/admin/trash', title: 'Trash', desc: 'Restore or permanently delete removed lots' },
  { href: '/admin/users', title: 'Users', desc: 'Manage authorized emails and their location' },
  { href: '/admin/locations', title: 'Locations', desc: 'Add and manage auction locations' },
  { href: '/admin/activity', title: 'Activity Log', desc: 'See what happened and when' },
  { href: '/admin/costs', title: 'API Costs', desc: 'Anthropic API spending breakdown' },
  { href: '/settings', title: 'AF Connection', desc: 'Update Auction Factory session cookie' },
];

export default function AdminPage() {
  const [jobStats, setJobStats] = useState<{ pending: number; processing: number; completed: number; failed: number } | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const fetchStats = async () => {
      const { data } = await supabase.from('jobs').select('status');
      if (data) {
        setJobStats({
          pending: data.filter((j) => j.status === 'pending').length,
          processing: data.filter((j) => j.status === 'processing').length,
          completed: data.filter((j) => j.status === 'completed').length,
          failed: data.filter((j) => j.status === 'failed').length,
        });
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header title="Admin" backHref="/auctions" />

      <div className="p-4 space-y-3">
        {jobStats && (jobStats.pending > 0 || jobStats.processing > 0) && (
          <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-xl p-4">
            <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-2">
              Background Jobs
            </h3>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-xs text-gray-400">Pending</p>
                <p className="font-black text-brand-navy">{jobStats.pending}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Running</p>
                <p className="font-black text-brand-blue">{jobStats.processing}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Done</p>
                <p className="font-black text-brand-green">{jobStats.completed}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Failed</p>
                <p className="font-black text-red-500">{jobStats.failed}</p>
              </div>
            </div>
            <button
              onClick={() => fetch('/api/jobs/process', { method: 'POST' }).catch(() => {})}
              className="mt-3 w-full text-xs font-bold text-brand-blue border border-brand-blue/30 rounded py-1"
            >
              Kick Processor
            </button>
          </div>
        )}

        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="block bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-brand-navy">{section.title}</h2>
                <p className="text-sm text-gray-400 mt-0.5">{section.desc}</p>
              </div>
              <svg
                className="w-5 h-5 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
