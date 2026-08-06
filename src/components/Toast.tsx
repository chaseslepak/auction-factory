'use client';

import { useEffect, useState } from 'react';

export type Toast = {
  id: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  tone?: 'info' | 'success' | 'error' | 'warning';
  durationMs?: number;
};

// Simple bottom-of-screen toast stack. Owner-driven: pass toasts + onDismiss.
// Kept minimal on purpose — no portal, no context provider, no library.
export default function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] w-[92%] max-w-md flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const durationMs = toast.durationMs ?? 7000;

  useEffect(() => {
    const id = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(id);
  }, [durationMs, onDismiss]);

  const toneClass =
    toast.tone === 'error'
      ? 'bg-red-600'
      : toast.tone === 'success'
      ? 'bg-brand-green-dark'
      : toast.tone === 'warning'
      ? 'bg-yellow-500 text-black'
      : 'bg-brand-navy';

  return (
    <div
      className={`pointer-events-auto ${toneClass} text-white rounded-xl px-4 py-3 shadow-xl flex items-center justify-between gap-3`}
      role="status"
    >
      <p className="text-sm font-medium flex-1">{toast.message}</p>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick();
            onDismiss();
          }}
          className="text-sm font-black uppercase tracking-wide underline underline-offset-4"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-lg opacity-60 hover:opacity-100 leading-none"
      >
        ×
      </button>
    </div>
  );
}

// Small hook that owns the toast queue + gives back a `showToast` function.
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));
  const show = (toast: Omit<Toast, 'id'>) => {
    const id = `t${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, ...toast }]);
    return id;
  };
  return { toasts, dismiss, show };
}
