'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/Header';

export default function SOPPage() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSOP = async () => {
      try {
        const res = await fetch('/api/sop');
        const data = await res.json();
        setContent(data.content || '');
      } catch {
        setContent('Failed to load SOP.');
      }
      setLoading(false);
    };
    fetchSOP();
  }, []);

  // Simple markdown-to-HTML renderer
  const renderMarkdown = (md: string) => {
    return md
      // Headers
      .replace(/^### (.+)$/gm, '<h3 class="text-base font-black text-brand-navy mt-6 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-lg font-black text-brand-navy mt-8 mb-3 pb-2 border-b border-gray-200">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-xl font-black text-brand-navy mb-4">$1</h1>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono text-brand-blue">$1</code>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-brand-blue underline" target="_blank">$1</a>')
      // Unordered list items
      .replace(/^- (.+)$/gm, '<li class="ml-4 text-sm text-gray-700 mb-1">• $1</li>')
      // Ordered list items
      .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 text-sm text-gray-700 mb-1 list-decimal list-inside">$1</li>')
      // Table rows (simple)
      .replace(/^\| (.+) \|$/gm, (match, inner) => {
        const cells = inner.split(' | ').map((c: string) => c.trim());
        return '<tr>' + cells.map((c: string) => `<td class="border border-gray-200 px-3 py-1.5 text-sm">${c}</td>`).join('') + '</tr>';
      })
      // Table separator (remove)
      .replace(/^\|[-| ]+\|$/gm, '')
      // Horizontal rule
      .replace(/^---$/gm, '<hr class="my-4 border-gray-200" />')
      // Paragraphs
      .replace(/^(?!<[hlutd]|<li|<hr|<a|<code|<strong)(.+)$/gm, '<p class="text-sm text-gray-700 mb-2">$1</p>')
      // Wrap tables
      .replace(/(<tr>[\s\S]*?<\/tr>)/g, '<table class="w-full border-collapse mb-4">$1</table>')
      // Line breaks
      .replace(/\n\n/g, '\n');
  };

  return (
    <div className="min-h-screen bg-brand-bg pb-12">
      <Header title="SOP / Manual" backHref="/admin" />

      <div className="p-4">
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
