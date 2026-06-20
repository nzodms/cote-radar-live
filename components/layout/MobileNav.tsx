"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ALL_NAV_ITEMS } from "./nav-config";

export function MobileNav() {
  const pathname = usePathname();
  const items = ALL_NAV_ITEMS.filter((i) =>
    ["/dashboard", "/orders", "/inbox", "/payments", "/suppliers"].includes(i.href),
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/90 backdrop-blur-xl lg:hidden">
      <div className="flex items-center justify-around px-2 py-1.5">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-2xs font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "text-primary")} />
              <span className="truncate">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
