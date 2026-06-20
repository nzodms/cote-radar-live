"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { OrderRow, OrderListHeader } from "@/components/orders/OrderRow";
import { OrderDetailSheet } from "@/components/orders/OrderDetailSheet";
import { useStore } from "@/lib/store/useStore";
import { useHydrated } from "@/lib/store/selectors";
import { ORDER_TABS } from "@/lib/labels";

function OrdersContent() {
  const params = useSearchParams();
  const hydrated = useHydrated();
  const orders = useStore((s) => s.orders);
  const suppliers = useStore((s) => s.suppliers);
  const quotes = useStore((s) => s.quotes);

  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  // Deep link: /orders?order=ord_xxx
  useEffect(() => {
    const id = params.get("order");
    if (id) setOpenOrderId(id);
  }, [params]);

  const tabsWithCounts = useMemo(
    () =>
      ORDER_TABS.map((t) => ({
        key: t.key,
        label: t.label,
        count:
          t.statuses.length === 0
            ? orders.length
            : orders.filter((o) => t.statuses.includes(o.status)).length,
      })),
    [orders],
  );

  const filtered = useMemo(() => {
    const activeTab = ORDER_TABS.find((t) => t.key === tab)!;
    const q = query.trim().toLowerCase();
    return orders
      .filter((o) => activeTab.statuses.length === 0 || activeTab.statuses.includes(o.status))
      .filter(
        (o) =>
          !q ||
          o.shopifyOrderNumber.toLowerCase().includes(q) ||
          o.productName.toLowerCase().includes(q) ||
          o.variant.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q),
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, tab, query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:hidden">
        <h1 className="text-xl font-semibold tracking-tight">Commandes</h1>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented items={tabsWithCounts} value={tab} onChange={setTab} layoutId="orders-tabs" />
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une commande…"
            className="pl-9"
          />
        </div>
      </div>

      {/* List */}
      <Card className="overflow-hidden p-0">
        <OrderListHeader />
        {!hydrated ? (
          <div className="divide-y divide-border/60">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-11 w-11 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Aucune commande"
            description="Aucune commande ne correspond à ce filtre."
            className="m-4 border-0"
          />
        ) : (
          <div>
            {filtered.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                suppliers={suppliers}
                quotes={quotes}
                onClick={() => setOpenOrderId(order.id)}
              />
            ))}
          </div>
        )}
      </Card>

      <OrderDetailSheet orderId={openOrderId} onOpenChange={(o) => !o && setOpenOrderId(null)} />
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-2xl bg-muted/50" />}>
      <OrdersContent />
    </Suspense>
  );
}
