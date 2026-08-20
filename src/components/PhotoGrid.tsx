'use client';

import { useRef, useState } from 'react';
import { processImage } from '@/lib/image-utils';

const MAX_PHOTOS = 10;

// After processing, image-utils resizes to a max 1024px on the long edge and
// jpeg-encodes at 0.85. A "healthy" resized photo lands at 80KB+ and 900px+
// on the long edge. Anything smaller almost certainly means the source was
// tiny (thumbnail, screenshot from a distance) and the AI descriptions will
// be poor. Warn before letting the user submit.
const MIN_ACCEPTABLE_BYTES = 40_000;
const MIN_ACCEPTABLE_LONG_EDGE = 600;

async function inspectDataUrl(dataUrl: string): Promise<{ bytes: number; longEdge: number }> {
  // dataUrl looks like: data:image/jpeg;base64,XXXXX
  const base64 = dataUrl.split(',', 2)[1] || '';
  const bytes = Math.round(base64.length * 3 / 4);
  const longEdge = await new Promise<number>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(Math.max(img.naturalWidth, img.naturalHeight));
    img.onerror = () => resolve(0);
    img.src = dataUrl;
  });
  return { bytes, longEdge };
}

export default function PhotoGrid({
  photos,
  onPhotosChange,
  disabled,
}: {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  disabled?: boolean;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [lowQualityIndexes, setLowQualityIndexes] = useState<number[]>([]);
  const [warning, setWarning] = useState<string | null>(null);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remaining = MAX_PHOTOS - photos.length;
    const toProcess = Array.from(files).slice(0, remaining);

    const processed = await Promise.all(toProcess.map(processImage));

    // Check quality of the newly added photos and surface a friendly warning
    // if any look too small/blurry to give the AI a fighting chance.
    const baseIndex = photos.length;
    const newLowQuality: number[] = [];
    let smallestBytes = Infinity;
    let smallestEdge = Infinity;
    for (let i = 0; i < processed.length; i++) {
      const stats = await inspectDataUrl(processed[i]);
      if (
        stats.bytes < MIN_ACCEPTABLE_BYTES ||
        stats.longEdge < MIN_ACCEPTABLE_LONG_EDGE
      ) {
        newLowQuality.push(baseIndex + i);
        smallestBytes = Math.min(smallestBytes, stats.bytes);
        smallestEdge = Math.min(smallestEdge, stats.longEdge);
      }
    }
    setLowQualityIndexes((prev) => [...prev, ...newLowQuality]);
    if (newLowQuality.length > 0) {
      setWarning(
        `${newLowQuality.length} photo${newLowQuality.length > 1 ? 's' : ''} may be too low-resolution — the AI description will be worse. ` +
          `Smallest: ${Math.round(smallestBytes / 1024)}KB, ${smallestEdge}px. ` +
          `Retake closer / with more light if possible.`
      );
    } else {
      setWarning(null);
    }

    onPhotosChange([...photos, ...processed]);

    // Reset both inputs so the same file can be re-selected
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (libraryInputRef.current) libraryInputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    onPhotosChange(photos.filter((_, i) => i !== index));
    setLowQualityIndexes((prev) =>
      prev.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i))
    );
  };

  return (
    <>
      {warning && (
        <div className="mb-2 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          {warning}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, i) => (
          <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-200">
            <img
              src={photo}
              alt={`Photo ${i + 1}`}
              className="w-full h-full object-cover"
            />
            {lowQualityIndexes.includes(i) && (
              <div
                className="absolute bottom-1 left-1 right-1 bg-yellow-500/90 text-black text-[10px] font-bold uppercase text-center py-0.5 rounded"
                title="This photo is low resolution — the AI description will be poor"
              >
                Low quality
              </div>
            )}
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
          <>
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="aspect-square rounded-lg border-2 border-dashed border-brand-blue/40 bg-brand-blue/5 flex flex-col items-center justify-center text-brand-blue hover:border-brand-blue transition-colors"
            >
              <svg className="w-8 h-8 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-xs font-medium">Take Photo</span>
            </button>
            <button
              onClick={() => libraryInputRef.current?.click()}
              className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-brand-blue hover:text-brand-blue transition-colors"
            >
              <svg className="w-8 h-8 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs font-medium">From Library</span>
            </button>
          </>
        )}

        {/* Camera-only input: capture="environment" hints the rear camera
            so Android opens the device camera directly instead of Google
            Photos. iOS Safari still shows a Take Photo/Photo Library sheet. */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={handleFiles}
          className="hidden"
        />
        {/* Library-only input: no capture attribute so the OS shows its
            gallery/files picker. Preserves the ability to add existing
            photos on Android where capture would otherwise force camera. */}
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFiles}
          className="hidden"
        />
      </div>
    </>
  );
}
