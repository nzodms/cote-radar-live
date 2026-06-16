"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ApiUsageBadge } from "./ApiUsageBadge";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/matches": "Matchs Coupe du monde",
  "/live": "Suivi live",
  "/history": "Historique des signaux",
  "/settings": "Réglages",
};

function titleFor(pathname: string): string {
  if (pathname === "/" ) return "Dashboard";
  const base = "/" + (pathname.split("/")[1] ?? "");
  if (base === "/matches" && pathname.split("/").length > 2) return "Détail du match";
  return TITLES[base] ?? "CoteRadar Live";
}

export function Topbar() {
  const pathname = usePathname() || "/";
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-night-950/85 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="lg:hidden flex h-7 w-7 items-center justify-center rounded-md bg-accent/20 text-accent-bright">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M12 2a10 10 0 100 20M2 12h20" strokeLinecap="round" />
            </svg>
          </span>
          <h1 className="text-sm font-semibold text-slate-100 sm:text-base">{titleFor(pathname)}</h1>
        </div>

        <div className="flex items-center gap-2">
          <ApiUsageBadge />
          <Link
            href="/settings"
            className="badge border border-border bg-night-850 text-slate-300 hover:text-slate-100"
          >
            Réglages
          </Link>
        </div>
      </div>
    </header>
  );
}
