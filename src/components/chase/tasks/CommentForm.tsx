'use client';

import { useRef, useState, useTransition } from 'react';
import { addTaskComment } from '@/lib/chase/actions/tasks';

export default function CommentForm({ taskId }: { taskId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const body = new FormData(e.currentTarget).get('body')?.toString() ?? '';
    if (!body.trim()) return;
    start(async () => {
      const res = await addTaskComment(taskId, body);
      if ('error' in res && res.error) setError(res.error);
      else formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-2">
      <textarea
        name="body"
        rows={2}
        placeholder="Add a comment…"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-blue focus:outline-none"
      />
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
        >
          {pending ? 'Posting…' : 'Post comment'}
        </button>
      </div>
    </form>
  );
}
