import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser, isAdmin } from '@/lib/chase/auth';
import { Card, CardBody, CardHeader } from '@/components/chase/shared/Card';
import EmptyState from '@/components/chase/shared/EmptyState';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const { profile } = await requireChaseUser();
  if (!isAdmin(profile.role)) redirect('/chase-os');
  const supabase = createChaseServerClient();
  const { data: invites } = await supabase.from('client_portal_invites').select('*').order('created_at', { ascending: false });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy sm:text-3xl">Client Portal</h1>
        <p className="mt-1 text-sm text-slate-600">Manage which clients can sign in and what they see.</p>
      </div>
      <Card>
        <CardHeader title="Invites" subtitle={`${invites?.length ?? 0}`} />
        <CardBody className="!p-0">
          {invites && invites.length > 0 ? (
            <ul>
              {invites.map((i: { id: string; email: string; company_id: string | null; accepted_at: string | null; created_at: string }) => (
                <li key={i.id} className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-b-0 sm:px-5">
                  <div>
                    <div className="text-sm font-semibold text-brand-navy">{i.email}</div>
                    <div className="mt-0.5 text-xs text-slate-500">Company: {i.company_id ?? '—'}</div>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${i.accepted_at ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                    {i.accepted_at ? 'Active' : 'Pending'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5"><EmptyState title="No client invites yet" description="Invite-creation UI ships in the next iteration." /></div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
