"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Package, Factory } from "lucide-react";
import { cn, flag } from "@/lib/utils";
import { useStore } from "@/lib/store/useStore";
import { ProductImage } from "@/components/ui/product-image";
import { Avatar } from "@/components/ui/avatar";

export function GlobalSearch() {
  const router = useRouter();
  const orders = useStore((s) => s.orders);
  const suppliers = useStore((s) => s.suppliers);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { orders: [], suppliers: [] };
    return {
      orders: orders
        .filter(
          (o) =>
            o.shopifyOrderNumber.toLowerCase().includes(q) ||
            o.productName.toLowerCase().includes(q) ||
            o.customerName.toLowerCase().includes(q),
        )
        .slice(0, 4),
      suppliers: suppliers
        .filter((s) => s.name.toLowerCase().includes(q) || s.specialty.toLowerCase().includes(q))
        .slice(0, 3),
    };
  }, [query, orders, suppliers]);

  const open = focused && query.trim().length > 0;
  const empty = open && results.orders.length === 0 && results.suppliers.length === 0;

  const go = (href: string) => {
    router.push(href);
    setQuery("");
    setFocused(false);
  };

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Rechercher une commande, un fournisseur…"
        className="h-10 w-full rounded-xl border border-border bg-white/70 pl-9 pr-12 text-sm shadow-xs backdrop-blur transition-all placeholder:text-muted-foreground/70 focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border border-border bg-secondary px-1.5 font-mono text-2xs text-muted-foreground sm:flex">
        ⌘K
      </kbd>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-popover shadow-elevated">
          {empty ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              Aucun résultat pour « {query} »
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto p-1.5">
              {results.orders.length > 0 && (
                <div className="mb-1">
                  <div className="px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Commandes
                  </div>
                  {results.orders.map((o) => (
                    <button
                      key={o.id}
                      onMouseDown={() => go(`/orders?order=${o.id}`)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-secondary",
                      )}
                    >
                      <ProductImage src={o.productImage} alt={o.productName} className="h-9 w-9" rounded="rounded-lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{o.productName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {o.shopifyOrderNumber} · {flag(o.countryCode)} {o.country}
                        </span>
                      </span>
                      <Package className="h-4 w-4 text-muted-foreground/60" />
                    </button>
                  ))}
                </div>
              )}
              {results.suppliers.length > 0 && (
                <div>
                  <div className="px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Fournisseurs
                  </div>
                  {results.suppliers.map((s) => (
                    <button
                      key={s.id}
                      onMouseDown={() => go(`/suppliers?supplier=${s.id}`)}
                      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-secondary"
                    >
                      <Avatar initials={s.initials} seed={s.id} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.name}</span>
                        <span className="block text-xs text-muted-foreground">{s.specialty}</span>
                      </span>
                      <Factory className="h-4 w-4 text-muted-foreground/60" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
