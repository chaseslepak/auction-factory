'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { visibleFor } from './navItems';
import type { ChaseRole } from '@/lib/chase/types';

export default function Sidebar({ role }: { role: ChaseRole }) {
  const pathname = usePathname();
  const items = visibleFor(role);

  return (
    <aside className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:border-r md:border-slate-200 md:bg-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-navy text-white text-sm font-bold">C</div>
        <div>
          <div className="text-sm font-semibold text-brand-navy">Chase OS</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Executive OS</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== '/chase-os' && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? 'bg-brand-navy text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-brand-navy'
              }`}
            >
              <span className="w-5 text-center text-base leading-none">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
