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
    <header className="sticky top-0 z-50 bg-brand-navy px-4 py-4 flex items-center gap-3">
      {backHref && (
        <Link
          href={backHref}
          className="text-white text-2xl leading-none"
          aria-label="Back"
        >
          &larr;
        </Link>
      )}
      <h1 className="text-white font-black text-sm tracking-[0.15em] uppercase">
        {title}
      </h1>
    </header>
  );
}
