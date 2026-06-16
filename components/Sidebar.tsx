"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function Icon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <Icon path="M3 12l9-9 9 9M5 10v10h14V10" /> },
  {
    href: "/matches",
    label: "Matchs",
    icon: <Icon path="M4 5h16v14H4zM4 9h16M9 5v14" />,
  },
  {
    href: "/live",
    label: "Live",
    icon: <Icon path="M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0M5 5a10 10 0 000 14M19 5a10 10 0 010 14" />,
  },
  {
    href: "/history",
    label: "Historique",
    icon: <Icon path="M3 12a9 9 0 109-9 9 9 0 00-9 9zm0 0H1m11-5v5l3 2" />,
  },
  {
    href: "/settings",
    label: "Réglages",
    icon: (
      <Icon path="M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1L14.5 2h-5l-.4 2.6a7 7 0 00-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1l.4 2.6h5l.4-2.6a7 7 0 001.7-1l2.3 1 2-3.4-2-1.5a7 7 0 00.1-1z" />
    ),
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/" || pathname.startsWith("/dashboard");
  return pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname() || "";
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-night-900/60 lg:block">
      <div className="sticky top-0 flex h-screen flex-col">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 text-accent-bright">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M12 2a10 10 0 100 20M12 2v20M2 12h20" strokeLinecap="round" />
            </svg>
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-100">CoteRadar</div>
            <div className="text-[10px] uppercase tracking-widest text-accent-bright">Live</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent/15 text-accent-bright"
                    : "text-slate-400 hover:bg-night-800 hover:text-slate-200"
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-4 pb-5">
          <div className="rounded-lg border border-border bg-night-850 p-3 text-[11px] leading-relaxed text-slate-500">
            Coupe du monde 2026 uniquement. Outil d&apos;analyse informative.
          </div>
        </div>
      </div>
    </aside>
  );
}
