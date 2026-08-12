'use client';

import { useEffect, useState } from 'react';

// Public manual/SOP page — mirrors /admin/sop but no auth required so it
// can be linked to prospective/onboarding users before they have accounts.
export default function ManualPage() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSOP = async () => {
      try {
        const res = await fetch('/api/sop');
        const data = await res.json();
        setContent(data.content || '');
      } catch {
        setContent('Failed to load manual.');
      }
      setLoading(false);
    };
    fetchSOP();
  }, []);

  const renderMarkdown = (md: string) => {
    return md
      .replace(/^### (.+)$/gm, '<h3 class="text-base font-black text-brand-navy mt-6 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-lg font-black text-brand-navy mt-8 mb-3 pb-2 border-b border-gray-200">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-xl font-black text-brand-navy mb-4">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono text-brand-blue">$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-brand-blue underline" target="_blank">$1</a>')
      .replace(/^- (.+)$/gm, '<li class="ml-4 text-sm text-gray-700 mb-1">• $1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 text-sm text-gray-700 mb-1 list-decimal list-inside">$1</li>')
      .replace(/^\| (.+) \|$/gm, (match, inner) => {
        const cells = inner.split(' | ').map((c: string) => c.trim());
        return '<tr>' + cells.map((c: string) => `<td class="border border-gray-200 px-3 py-1.5 text-sm">${c}</td>`).join('') + '</tr>';
      })
      .replace(/^\|[-| ]+\|$/gm, '')
      .replace(/^---$/gm, '<hr class="my-4 border-gray-200" />')
      .replace(/^(?!<[hlutd]|<li|<hr|<a|<code|<strong)(.+)$/gm, '<p class="text-sm text-gray-700 mb-2">$1</p>')
      .replace(/(<tr>[\s\S]*?<\/tr>)/g, '<table class="w-full border-collapse mb-4">$1</table>')
      .replace(/\n\n/g, '\n');
  };

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/af-mark.png" alt="" className="w-8 h-8 rounded" />
        <div>
          <h1 className="font-black text-brand-navy text-sm">Auction Factory Official Lotter</h1>
          <p className="text-xs text-gray-500">Manual & SOP</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 pb-12">
        {loading ? (
          <p className="text-center text-gray-400 py-12">Loading...</p>
        ) : (
          <div
            className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 prose-sm"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        )}
      </div>
    </div>
  );
}
