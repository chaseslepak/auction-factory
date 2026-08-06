'use client';

import Link from 'next/link';

export default function Header({
  title,
  backHref,
}: {
  title: string;
  backHref?: string;
}) {
  return (
    <header className="sticky top-0 z-50 bg-brand-navy px-4 py-3 flex items-center gap-3">
      {backHref && (
        <Link
          href={backHref}
          className="text-white text-2xl leading-none"
          aria-label="Back"
        >
          &larr;
        </Link>
      )}
      <div className="w-8 h-8 bg-white rounded-md p-0.5 flex items-center justify-center flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/af-mark.png"
          alt="AF"
          className="w-full h-full object-contain"
        />
      </div>
      <h1 className="text-white font-black text-sm tracking-[0.15em] uppercase truncate">
        {title}
      </h1>
    </header>
  );
}
