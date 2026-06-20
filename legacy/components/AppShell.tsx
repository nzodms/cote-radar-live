"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { ResponsibleGamingFooter } from "./ResponsibleGamingFooter";
import { cn } from "@/lib/utils";

function mobileActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/" || pathname.startsWith("/dashboard");
  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />

        <main className="flex-1 px-4 pb-24 pt-4 sm:px-6 lg:pb-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>

        <ResponsibleGamingFooter />
      </div>

      {/* Navigation mobile (bottom bar) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-night-900/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-between">
          {NAV_ITEMS.map((item) => {
            const active = mobileActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2 text-[10px]",
                  active ? "text-accent-bright" : "text-slate-500"
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
