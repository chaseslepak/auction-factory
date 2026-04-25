import type { ChaseRole } from '@/lib/chase/types';

export type NavItem = {
  href: string;
  label: string;
  short: string;
  icon: string;
  allow: ChaseRole[];
  bottomNav?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: '/chase-os',              label: 'Today',         short: 'Today',  icon: '☀',  allow: ['owner','admin','team_member','client'], bottomNav: true },
  { href: '/chase-os/queue',        label: 'Command Queue', short: 'Queue',  icon: '⚡', allow: ['owner','admin','team_member'],            bottomNav: true },
  { href: '/chase-os/tasks',        label: 'Tasks',         short: 'Tasks',  icon: '✓',  allow: ['owner','admin','team_member','client'], bottomNav: true },
  { href: '/chase-os/companies',    label: 'Companies',     short: 'Cos.',   icon: '◆',  allow: ['owner','admin','team_member','client'] },
  { href: '/chase-os/people',       label: 'People',        short: 'People', icon: '◉',  allow: ['owner','admin','team_member'] },
  { href: '/chase-os/decisions',    label: 'Decisions',     short: 'Dec.',   icon: '⚖',  allow: ['owner','admin','team_member','client'] },
  { href: '/chase-os/deals',        label: 'Deals',         short: 'Deals',  icon: '$',  allow: ['owner','admin','team_member'] },
  { href: '/chase-os/files',        label: 'Files',         short: 'Files',  icon: '▤',  allow: ['owner','admin','team_member','client'] },
  { href: '/chase-os/health',       label: 'Health',        short: 'Health', icon: '♥',  allow: ['owner','admin','team_member','client'] },
  { href: '/chase-os/clients',      label: 'Client Portal', short: 'Cli.',   icon: '◐',  allow: ['owner','admin'] },
  { href: '/chase-os/reports',      label: 'Reports',       short: 'Rep.',   icon: '▦',  allow: ['owner','admin'] },
  { href: '/chase-os/integrations', label: 'Integrations',  short: 'Int.',   icon: '⚙',  allow: ['owner','admin'] },
];

export function visibleFor(role: ChaseRole) {
  return NAV_ITEMS.filter((i) => i.allow.includes(role));
}
