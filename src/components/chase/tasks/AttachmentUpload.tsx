'use client';

import { useRef, useState } from 'react';
import { createChaseClient } from '@/lib/chase/supabase/client';
import { recordTaskAttachment } from '@/lib/chase/actions/attachments';

export default function AttachmentUpload({ taskId }: { taskId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setProgress(`Uploading ${file.name}…`);

    try {
      const supabase = createChaseClient();
      const safeName = file.name.replace(/[^\w.\-]/g, '_');
      const storagePath = `tasks/${taskId}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from('chase-files')
        .upload(storagePath, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw new Error(upErr.message);

      const res = await recordTaskAttachment({
        task_id: taskId,
        storage_path: storagePath,
        filename: file.name,
        size_bytes: file.size,
        mime_type: file.type || 'application/octet-stream',
      });
      if ('error' in res && res.error) throw new Error(res.error);

      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
        <span>{busy ? 'Uploading…' : '+ Upload file'}</span>
        <input
          ref={inputRef}
          type="file"
          onChange={onChange}
          disabled={busy}
          className="hidden"
        />
      </label>
      {progress ? <p className="text-xs text-slate-500">{progress}</p> : null}
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
