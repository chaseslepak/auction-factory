'use client';

import Link from 'next/link';
import Header from '@/components/Header';

const sections = [
  { href: '/admin/trash', title: 'Trash', desc: 'Restore or permanently delete removed lots' },
  { href: '/admin/users', title: 'Users', desc: 'Manage authorized emails' },
  { href: '/admin/activity', title: 'Activity Log', desc: 'See what happened and when' },
  { href: '/admin/costs', title: 'API Costs', desc: 'Anthropic API spending breakdown' },
  { href: '/settings', title: 'AF Connection', desc: 'Update Auction Factory session cookie' },
];

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-brand-bg">
      <Header title="Admin" backHref="/auctions" />

      <div className="p-4 space-y-3">
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
