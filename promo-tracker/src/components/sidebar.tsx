"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { UserRole } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  roles?: UserRole[];
}

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/promotions", label: "Promotions" },
  { href: "/exports", label: "Exports", roles: ["admin", "accounting", "ops"] },
  { href: "/catalog/products", label: "Products", roles: ["admin", "ops"] },
  { href: "/catalog/customers", label: "Customers", roles: ["admin", "sales"] },
  { href: "/catalog/distributors", label: "Distributors", roles: ["admin"] },
  { href: "/admin/users", label: "Users", roles: ["admin"] }
];

export function Sidebar({ role, email }: { role: UserRole | null; email: string | null }) {
  const pathname = usePathname();

  const items = NAV.filter((it) => !it.roles || (role && it.roles.includes(role)));

  return (
    <aside className="w-56 shrink-0 border-r border-brand-border bg-white min-h-screen flex flex-col">
      <div className="px-5 py-4 border-b border-brand-border">
        <div className="font-semibold">Promo Tracker</div>
        <div className="text-xs text-brand-muted">Boylan · Pretty Tasty</div>
      </div>
      <nav className="flex-1 py-3">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "block px-5 py-2 text-sm hover:bg-gray-50",
                active && "bg-gray-100 font-medium"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-brand-border px-5 py-3 text-xs text-brand-muted">
        <div className="truncate">{email}</div>
        <div className="capitalize">{role ?? "no role"}</div>
        <form action="/api/auth/signout" method="post" className="mt-2">
          <button className="text-brand-ink underline">Sign out</button>
        </form>
      </div>
    </aside>
  );
}
