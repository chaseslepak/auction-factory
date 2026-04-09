'use client';

const colors = {
  high: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-red-100 text-red-800',
};

export default function ConfidenceChip({
  confidence,
}: {
  confidence: 'high' | 'medium' | 'low' | null;
}) {
  if (!confidence) return null;
  return (
    <span
      className={`inline-block text-xs font-bold uppercase px-2 py-0.5 rounded-full ${colors[confidence]}`}
    >
      {confidence}
    </span>
  );
}
