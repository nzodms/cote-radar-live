"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Plus, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import { GlobalSearch } from "./GlobalSearch";
import { NewRequestDialog } from "./NewRequestDialog";
import { DataSourceBadge } from "./DataSourceBadge";
import { navItemForPath } from "./nav-config";
import { ACTIVITY_META } from "@/lib/labels";
import { cn, timeAgo } from "@/lib/utils";
import { useStore } from "@/lib/store/useStore";
import { useHydrated } from "@/lib/store/selectors";

const ACTIVITY_DOT: Record<string, string> = {
  quote: "bg-info",
  message: "bg-muted-foreground",
  payment: "bg-warning",
  shipment: "bg-success",
  selection: "bg-primary",
  incident: "bg-danger",
  system: "bg-muted-foreground",
};

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const nav = navItemForPath(pathname);
  const activity = useStore((s) => s.activity);
  const orders = useStore((s) => s.orders);
  const hydrated = useHydrated();
  const [newOpen, setNewOpen] = useState(false);

  const alerts = orders.filter((o) => o.status === "incident" || o.trackingStatus === "delayed").length;

  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        {/* Mobile logo */}
        <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-gradient">
            <Compass className="h-4 w-4 text-white" />
          </span>
        </Link>

        {/* Title */}
        <div className="hidden min-w-0 md:block">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {nav?.label ?? "SupplierPilot"}
          </h1>
          <p className="truncate text-xs text-muted-foreground">{nav?.subtitle}</p>
        </div>

        <div className="ml-auto flex flex-1 items-center justify-end gap-2 sm:gap-3">
          <div className="hidden flex-1 justify-end sm:flex">
            <GlobalSearch />
          </div>

          <DataSourceBadge />

          {/* Notifications */}
          <Popover
            trigger={
              <span className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white/70 text-muted-foreground shadow-xs transition-colors hover:text-foreground">
                <Bell className="h-[18px] w-[18px]" />
                {hydrated && alerts > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-danger opacity-70" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
                  </span>
                )}
              </span>
            }
            contentClassName="w-[340px] p-0"
          >
            {(close) => (
              <div>
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <span className="text-sm font-semibold">Notifications</span>
                  {alerts > 0 && (
                    <span className="rounded-full bg-danger-soft px-2 py-0.5 text-2xs font-semibold text-danger">
                      {alerts} alerte{alerts > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="max-h-[60vh] overflow-y-auto py-1">
                  {activity.slice(0, 7).map((a) => (
                    <button
                      key={a.id}
                      onClick={() => {
                        if (a.orderId) router.push(`/orders?order=${a.orderId}`);
                        close();
                      }}
                      className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-secondary"
                    >
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", ACTIVITY_DOT[a.type])} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-snug">{a.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{a.description}</span>
                        <span className="text-2xs text-muted-foreground/70">{timeAgo(a.timestamp)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Popover>

          <Button onClick={() => setNewOpen(true)} className="shadow-glow-soft">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nouvelle demande</span>
          </Button>
        </div>
      </div>

      <NewRequestDialog open={newOpen} onOpenChange={setNewOpen} />
    </header>
  );
}
