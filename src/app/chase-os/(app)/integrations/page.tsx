import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser, isAdmin } from '@/lib/chase/auth';
import { Card, CardBody, CardHeader } from '@/components/chase/shared/Card';
import EmptyState from '@/components/chase/shared/EmptyState';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const PROVIDERS = [
  { id: 'gcal', name: 'Google Calendar', desc: 'Sync events and create blocks from queue items.' },
  { id: 'slack', name: 'Slack', desc: 'Post queue digests and decision pings.' },
  { id: 'gmail', name: 'Gmail', desc: 'Convert email threads into tasks.' },
  { id: 'docusign', name: 'DocuSign', desc: 'Track signature requests as tasks.' },
];

export default async function IntegrationsPage() {
  const { profile } = await requireChaseUser();
  if (!isAdmin(profile.role)) redirect('/chase-os');
  const supabase = createChaseServerClient();
  const { data: rows } = await supabase.from('integrations').select('*');
  const byProvider = new Map(((rows as { provider: string; status: string }[]) || []).map((r) => [r.provider, r]));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy sm:text-3xl">Integrations</h1>
        <p className="mt-1 text-sm text-slate-600">Owner / Admin only. Connections to external systems.</p>
      </div>
      <Card>
        <CardHeader title="Available providers" />
        <CardBody className="!p-0">
          <ul>
            {PROVIDERS.map((p) => {
              const row = byProvider.get(p.id);
              const status = row?.status ?? 'disconnected';
              return (
                <li key={p.id} className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-b-0 sm:px-5">
                  <div>
                    <div className="text-sm font-semibold text-brand-navy">{p.name}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{p.desc}</div>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${status === 'connected' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {status}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="p-5">
            <EmptyState title="OAuth flows coming next" description="UI surface ships now; per-provider OAuth wiring lands in the next iteration." />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
