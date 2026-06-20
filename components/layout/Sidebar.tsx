"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Compass, Settings, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store/useStore";
import { computeKpis, totalUnread, useHydrated } from "@/lib/store/selectors";
import { NAV_GROUPS, type BadgeKey } from "./nav-config";

export function Sidebar() {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const orders = useStore((s) => s.orders);
  const conversations = useStore((s) => s.conversations);
  const quotes = useStore((s) => s.quotes);

  const kpis = computeKpis({ orders, conversations, quotes });
  const badges: Record<BadgeKey, number> = {
    orders: kpis.ordersToProcess,
    inbox: totalUnread(conversations),
    payments: kpis.awaitingPayment,
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[268px] flex-col border-r border-border/70 bg-white/55 backdrop-blur-2xl lg:flex">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-gradient shadow-glow-soft">
          <Compass className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-[0.95rem] font-semibold tracking-tight">SupplierPilot</div>
          <div className="text-2xs font-medium text-muted-foreground">Supplier Operations</div>
        </div>
      </div>

      {/* Store context */}
      <div className="px-3">
        <button className="group flex w-full items-center gap-3 rounded-xl border border-border/70 bg-white px-3 py-2.5 text-left shadow-xs transition-colors hover:border-border-strong">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-bold text-white">
            L
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">Lumière &amp; Co</span>
            <span className="block text-2xs text-muted-foreground">Shopify · Connecté</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground/70 transition-colors group-hover:text-foreground" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="mt-4 flex-1 space-y-5 overflow-y-auto px-3 pb-4 no-scrollbar">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                const Icon = item.icon;
                const count = item.badge && hydrated ? badges[item.badge] : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200",
                      active
                        ? "bg-primary-soft text-primary shadow-xs ring-1 ring-primary/15"
                        : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-active-bar"
                        transition={{ type: "spring", damping: 30, stiffness: 380 }}
                        className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                      />
                    )}
                    <Icon
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 transition-colors",
                        active ? "text-primary" : "text-muted-foreground/80 group-hover:text-foreground",
                      )}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {count > 0 && (
                      <span
                        className={cn(
                          "min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-2xs font-semibold tabular-nums",
                          active ? "bg-primary text-white" : "bg-muted-foreground/15 text-muted-foreground",
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Profile card */}
      <div className="border-t border-border/70 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-semibold text-white ring-2 ring-white">
            EM
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium">Emma Laurent</div>
            <div className="flex items-center gap-1 text-2xs text-muted-foreground">
              <span className="inline-flex items-center rounded bg-primary-soft px-1 font-semibold text-primary">
                Scale
              </span>
              <span>· Plan annuel</span>
            </div>
          </div>
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white hover:text-foreground"
            aria-label="Paramètres"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </aside>
  );
}
