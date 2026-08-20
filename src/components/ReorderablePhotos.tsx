'use client';

import { useState } from 'react';

interface Photo {
  id: string;
  url: string;
  storage_path: string;
}

export default function ReorderablePhotos({
  photos,
  onReorder,
  onDelete,
  onAdd,
  onZoom,
  canEdit,
}: {
  photos: Photo[];
  onReorder: (newOrder: string[]) => void;
  onDelete?: (photoId: string) => void;
  onAdd?: (files: FileList | null) => void;
  onZoom?: (url: string) => void;
  canEdit?: boolean;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  // Visible on-device debug crumb — fires the instant onChange runs.
  // If this NEVER appears, the OS never surfaced the file to the input
  // (iOS PWA / standalone quirk); if it appears with "0 files" the
  // FileList was invalidated before we captured it.
  const [pickerMsg, setPickerMsg] = useState<string | null>(null);

  const handleDragStart = (i: number) => {
    setDragging(i);
  };

  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    setDragOver(i);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (dragging === null || dragging === dropIndex) {
      setDragging(null);
      setDragOver(null);
      return;
    }
    const newPhotos = [...photos];
    const [moved] = newPhotos.splice(dragging, 1);
    newPhotos.splice(dropIndex, 0, moved);
    onReorder(newPhotos.map((p) => p.id));
    setDragging(null);
    setDragOver(null);
  };

  const moveUp = (i: number) => {
    if (i === 0) return;
    const newPhotos = [...photos];
    [newPhotos[i - 1], newPhotos[i]] = [newPhotos[i], newPhotos[i - 1]];
    onReorder(newPhotos.map((p) => p.id));
  };

  const moveDown = (i: number) => {
    if (i === photos.length - 1) return;
    const newPhotos = [...photos];
    [newPhotos[i + 1], newPhotos[i]] = [newPhotos[i], newPhotos[i + 1]];
    onReorder(newPhotos.map((p) => p.id));
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const count = files?.length ?? 0;
    setPickerMsg(`Received ${count} photo${count === 1 ? '' : 's'} — uploading…`);
    // Clear the visible crumb after a bit so it doesn't linger.
    setTimeout(() => setPickerMsg(null), 5000);
    if (onAdd) onAdd(files);
    // Clear input value AFTER passing files, so the same file can be
    // picked again next time.
    e.target.value = '';
  };

  return (
    <div>
      {pickerMsg && (
        <div className="mb-2 rounded-md bg-brand-blue/10 border border-brand-blue/40 px-2 py-1 text-xs text-brand-blue">
          {pickerMsg}
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {photos.map((photo, i) => (
          <div
            key={photo.id}
            draggable={canEdit}
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={(e) => handleDrop(e, i)}
            className={`w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200 relative ${
              dragging === i ? 'opacity-50' : ''
            } ${dragOver === i ? 'ring-2 ring-brand-blue' : ''}`}
          >
            <img
              src={photo.url}
              alt={`Photo ${i + 1}`}
              className="w-full h-full object-cover cursor-zoom-in"
              onClick={(e) => {
                if (!canEdit && onZoom) {
                  e.stopPropagation();
                  onZoom(photo.url);
                }
              }}
            />
            {i === 0 && (
              <div className="absolute bottom-0 left-0 right-0 bg-brand-green text-white text-xs font-bold text-center py-0.5">
                PRIMARY
              </div>
            )}
            {canEdit && (
              <>
                {onDelete && (
                  <button
                    onClick={() => onDelete(photo.id)}
                    className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center"
                  >
                    &times;
                  </button>
                )}
                <div className="absolute top-1 left-1 flex flex-col gap-0.5">
                  {i > 0 && (
                    <button
                      onClick={() => moveUp(i)}
                      className="w-5 h-5 bg-black/60 rounded text-white text-xs flex items-center justify-center"
                      title="Move left"
                    >
                      ‹
                    </button>
                  )}
                  {i < photos.length - 1 && (
                    <button
                      onClick={() => moveDown(i)}
                      className="w-5 h-5 bg-black/60 rounded text-white text-xs flex items-center justify-center"
                      title="Move right"
                    >
                      ›
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
        {canEdit && onAdd && (
          <>
            {/* Camera + Library use the "input overlay" pattern: the
                real <input> is stretched over the visual tile at
                opacity 0. The user's tap lands directly on the input
                itself — no JS click(), no <label> wrapping, no hidden
                display. This is the only pattern that reliably fires
                onChange in iOS Safari standalone/PWA mode. */}
            <div className="relative w-20 h-20 flex-shrink-0 rounded-lg border-2 border-dashed border-brand-blue/40 bg-brand-blue/5 flex flex-col items-center justify-center text-brand-blue">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-[9px] font-medium mt-0.5">Camera</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFilePick}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label="Take a photo"
              />
            </div>
            <div className="relative w-20 h-20 flex-shrink-0 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-[9px] font-medium mt-0.5">Library</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFilePick}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label="Choose photos from library"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
