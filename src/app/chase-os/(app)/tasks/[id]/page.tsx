import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser, canEditTask } from '@/lib/chase/auth';
import { Card, CardBody, CardHeader } from '@/components/chase/shared/Card';
import EmptyState from '@/components/chase/shared/EmptyState';
import Avatar from '@/components/chase/shared/Avatar';
import { PriorityBadge, StatusBadge, UrgencyBadge } from '@/components/chase/shared/Badge';
import TaskStatusControls from '@/components/chase/tasks/TaskStatusControls';
import CommentForm from '@/components/chase/tasks/CommentForm';
import type { Company, Profile, Task, TaskAttachment, TaskComment } from '@/lib/chase/types';

export const dynamic = 'force-dynamic';

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  const { user, profile } = await requireChaseUser();
  const supabase = createChaseServerClient();

  const { data: task } = await supabase.from('tasks').select('*').eq('id', params.id).maybeSingle<Task>();
  if (!task) notFound();

  const [{ data: comments }, { data: attachments }, { data: profiles }, { data: company }] = await Promise.all([
    supabase.from('task_comments').select('*').eq('task_id', task.id).order('created_at'),
    supabase.from('task_attachments').select('*').eq('task_id', task.id).order('created_at'),
    supabase.from('profiles').select('id, display_name, role').in('id', [task.submitted_by, task.assigned_to].filter(Boolean) as string[]),
    task.company_id ? supabase.from('companies').select('*').eq('id', task.company_id).maybeSingle<Company>() : Promise.resolve({ data: null }),
  ]);

  const profileById = new Map<string, Pick<Profile, 'id' | 'display_name' | 'role'>>(
    ((profiles as Pick<Profile, 'id' | 'display_name' | 'role'>[]) || []).map((p) => [p.id, p]),
  );
  const submittedBy = profileById.get(task.submitted_by);
  const assignedTo = task.assigned_to ? profileById.get(task.assigned_to) : null;

  const editable = canEditTask(profile.role, task.submitted_by === user.id, task.assigned_to === user.id);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div>
        <Link href="/chase-os/tasks" className="text-xs font-semibold text-brand-blue hover:underline">
          ← All tasks
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-brand-navy sm:text-3xl">{task.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PriorityBadge value={task.priority} />
          <UrgencyBadge value={task.urgency} />
          <StatusBadge value={task.status} />
          {task.due_date ? <span className="text-xs text-slate-500">· due {new Date(task.due_date).toLocaleString()}</span> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {task.description ? (
            <Card>
              <CardHeader title="Description" />
              <CardBody>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{task.description}</p>
              </CardBody>
            </Card>
          ) : null}

          {task.what_is_needed_from_chase ? (
            <Card>
              <CardHeader title="What's needed from Chase" />
              <CardBody>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{task.what_is_needed_from_chase}</p>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Comments" subtitle={`${comments?.length ?? 0} message${(comments?.length ?? 0) === 1 ? '' : 's'}`} />
            <CardBody className="space-y-3">
              {comments && comments.length > 0 ? (
                <ul className="space-y-3">
                  {(comments as TaskComment[]).map((c) => {
                    const author = profileById.get(c.author_id);
                    return (
                      <li key={c.id} className="flex gap-3">
                        <Avatar name={author?.display_name} size={32} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-semibold text-brand-navy">{author?.display_name ?? 'Someone'}</span>
                            <span className="text-[11px] text-slate-400">{new Date(c.created_at).toLocaleString()}</span>
                          </div>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{c.body}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState title="No comments yet" />
              )}
              <div className="border-t border-slate-100 pt-3">
                <CommentForm taskId={task.id} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Attachments" />
            <CardBody>
              {attachments && attachments.length > 0 ? (
                <ul className="space-y-2">
                  {(attachments as TaskAttachment[]).map((a) => (
                    <li key={a.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      <span className="truncate">{a.filename}</span>
                      <span className="text-xs text-slate-500">{a.size_bytes ? `${Math.round(a.size_bytes / 1024)} KB` : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No attachments" description="Upload via Storage; this list reflects task_attachments rows." />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Status" />
            <CardBody>
              {editable ? (
                <TaskStatusControls taskId={task.id} current={task.status} />
              ) : (
                <p className="text-xs text-slate-500">You don&apos;t have permission to change status.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <CardBody className="space-y-3 text-sm">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Submitted by</div>
                <div className="mt-0.5 flex items-center gap-2"><Avatar name={submittedBy?.display_name} size={24} /> {submittedBy?.display_name ?? '—'}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Assigned to</div>
                <div className="mt-0.5 flex items-center gap-2">
                  {assignedTo ? <><Avatar name={assignedTo.display_name} size={24} /> {assignedTo.display_name}</> : <span className="text-slate-500">Unassigned</span>}
                </div>
              </div>
              {company ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Company</div>
                  <div className="mt-0.5">
                    <Link href={`/chase-os/companies/${company.id}`} className="text-brand-blue hover:underline">{company.name}</Link>
                  </div>
                </div>
              ) : null}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Created</div>
                <div className="mt-0.5 text-slate-600">{new Date(task.created_at).toLocaleString()}</div>
              </div>
              {task.completed_at ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Completed</div>
                  <div className="mt-0.5 text-slate-600">{new Date(task.completed_at).toLocaleString()}</div>
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
