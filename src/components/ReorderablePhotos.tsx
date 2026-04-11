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

  // Touch handlers for mobile
  const [touchStart, setTouchStart] = useState<number | null>(null);

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

  return (
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
        <label className="w-20 h-20 flex-shrink-0 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 cursor-pointer hover:border-brand-blue hover:text-brand-blue">
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onAdd(e.target.files)}
          />
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </label>
      )}
    </div>
  );
}
