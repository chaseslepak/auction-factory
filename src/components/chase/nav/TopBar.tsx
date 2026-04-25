import Link from 'next/link';
import Avatar from '../shared/Avatar';
import { RoleBadge } from '../shared/Badge';
import { signOut } from '@/lib/chase/actions/auth';
import type { Profile } from '@/lib/chase/types';

export default function TopBar({ profile }: { profile: Profile }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3 md:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-navy text-white text-sm font-bold">C</div>
        <span className="text-sm font-semibold text-brand-navy">Chase OS</span>
      </div>
      <div className="hidden md:block flex-1">
        <div className="max-w-md">
          {/* Placeholder search; non-functional in foundation. */}
          <input
            type="search"
            placeholder="Search tasks, companies, people…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-brand-blue focus:bg-white focus:outline-none"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/chase-os/tasks/new"
          className="hidden sm:inline-flex items-center gap-1 rounded-lg bg-brand-blue px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-blue/90"
        >
          + New task
        </Link>
        <div className="flex items-center gap-2">
          <Avatar name={profile.display_name} size={32} />
          <div className="hidden sm:block text-right">
            <div className="text-sm font-semibold text-brand-navy leading-tight">{profile.display_name}</div>
            <div className="mt-0.5"><RoleBadge value={profile.role} /></div>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
            aria-label="Sign out"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
