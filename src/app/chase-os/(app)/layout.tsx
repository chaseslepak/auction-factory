import type { Metadata, Viewport } from 'next';
import { requireChaseUser, isStaff } from '@/lib/chase/auth';
import Sidebar from '@/components/chase/nav/Sidebar';
import MobileNav from '@/components/chase/nav/MobileNav';
import TopBar from '@/components/chase/nav/TopBar';
import QuickCapture from '@/components/chase/today/QuickCapture';

export const metadata: Metadata = {
  title: 'Chase OS',
  description: 'Executive operating system',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0A1628',
};

export default async function ChaseAppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireChaseUser();
  return (
    <div className="flex min-h-screen bg-brand-bg">
      <Sidebar role={profile.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar profile={profile} />
        <main className="flex-1 px-4 pb-24 pt-4 sm:px-6 md:pb-8">{children}</main>
      </div>
      <MobileNav role={profile.role} />
      {isStaff(profile.role) ? <QuickCapture /> : null}
    </div>
  );
}
