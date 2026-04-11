'use client';

// Animated indeterminate progress bar for operations with unknown duration
export default function IndeterminateBar({ label }: { label?: string }) {
  return (
    <div className="w-full">
      {label && (
        <p className="text-xs text-gray-600 mb-1 text-center">{label}</p>
      )}
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden relative">
        <div className="absolute inset-y-0 w-1/3 gradient-btn rounded-full animate-indeterminate" />
      </div>
      <style jsx>{`
        @keyframes indeterminate {
          0% { left: -33%; }
          100% { left: 100%; }
        }
        .animate-indeterminate {
          animation: indeterminate 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
