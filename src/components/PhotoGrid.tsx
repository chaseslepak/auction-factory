'use client';

import { useRef } from 'react';
import { processImage } from '@/lib/image-utils';

const MAX_PHOTOS = 10;

export default function PhotoGrid({
  photos,
  onPhotosChange,
  disabled,
}: {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remaining = MAX_PHOTOS - photos.length;
    const toProcess = Array.from(files).slice(0, remaining);

    const processed = await Promise.all(toProcess.map(processImage));
    onPhotosChange([...photos, ...processed]);

    // Reset input so the same file can be re-selected
    if (inputRef.current) inputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    onPhotosChange(photos.filter((_, i) => i !== index));
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((photo, i) => (
        <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-200">
          <img
            src={photo}
            alt={`Photo ${i + 1}`}
            className="w-full h-full object-cover"
          />
          {!disabled && (
            <button
              onClick={() => removePhoto(i)}
              className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full text-white text-xs flex items-center justify-center"
              aria-label="Remove photo"
            >
              X
            </button>
          )}
        </div>
      ))}

      {photos.length < MAX_PHOTOS && !disabled && (
        <button
          onClick={() => inputRef.current?.click()}
          className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-brand-blue hover:text-brand-blue transition-colors"
        >
          <svg className="w-8 h-8 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-xs font-medium">Add Photo</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFiles}
        className="hidden"
      />
    </div>
  );
}
