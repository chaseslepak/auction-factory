'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { visibleFor } from './navItems';
import type { ChaseRole } from '@/lib/chase/types';

export default function MobileNav({ role }: { role: ChaseRole }) {
  const pathname = usePathname();
  const items = visibleFor(role).filter((i) => i.bottomNav);
  // Add a "More" pseudo-item that links to companies (or tasks, depending on role)
  const more = visibleFor(role).find((i) => !i.bottomNav);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length + (more ? 1 : 0)}, minmax(0, 1fr))`, paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== '/chase-os' && pathname?.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium ${
              active ? 'text-brand-navy' : 'text-slate-500'
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span>{item.short}</span>
          </Link>
        );
      })}
      {more ? (
        <Link href="/chase-os/companies" className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-slate-500">
          <span className="text-lg leading-none">···</span>
          <span>More</span>
        </Link>
      ) : null}
    </nav>
  );
}
