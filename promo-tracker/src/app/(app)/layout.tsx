import { Sidebar } from "@/components/sidebar";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireUser();
  return (
    <div className="flex min-h-screen">
      <Sidebar role={profile?.role ?? null} email={user.email ?? null} />
      <main className="flex-1 p-8 max-w-[1200px]">{children}</main>
    </div>
  );
}
