'use client';

import { useEffect } from 'react';

export default function ImageZoom({
  src,
  onClose,
}: {
  src: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!src) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4"
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white text-2xl flex items-center justify-center"
        aria-label="Close"
      >
        &times;
      </button>
      <img
        src={src}
        alt="Full size"
        className="max-w-full max-h-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
