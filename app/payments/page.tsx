"use client";

import { useMemo, useState } from "react";
import { Wallet, CreditCard, Truck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PurchaseRow } from "@/components/payments/PurchaseRow";
import { AddTrackingDialog } from "@/components/orders/AddTrackingDialog";
import { useStore } from "@/lib/store/useStore";
import { buildPurchases, useHydrated } from "@/lib/store/selectors";
import { formatCurrency } from "@/lib/utils";
import type { Order, Purchase } from "@/types";

const TABS: { key: string; label: string; match: (p: Purchase) => boolean }[] = [
  { key: "to_pay", label: "À payer", match: (p) => p.paymentStatus === "to_pay" },
  { key: "paid", label: "Payé", match: (p) => p.paymentStatus === "paid" },
  { key: "awaiting", label: "Attente suivi", match: (p) => p.status === "awaiting_tracking" },
  { key: "shipped", label: "Expédié", match: (p) => p.status === "shipped" },
  { key: "incidents", label: "Incidents", match: (p) => p.status === "incident" || p.status === "delayed" || p.isLate },
];

export default function PaymentsPage() {
  const hydrated = useHydrated();
  const orders = useStore((s) => s.orders);
  const suppliers = useStore((s) => s.suppliers);
  const quotes = useStore((s) => s.quotes);

  const [tab, setTab] = useState("to_pay");
  const [trackingOrder, setTrackingOrder] = useState<Order | null>(null);

  const purchases = useMemo(() => buildPurchases(orders, suppliers, quotes), [orders, suppliers, quotes]);

  const tabsWithCounts = TABS.map((t) => ({
    key: t.key,
    label: t.label,
    count: purchases.filter(t.match).length,
  }));

  const activeTab = TABS.find((t) => t.key === tab)!;
  const filtered = purchases
    .filter(activeTab.match)
    .sort((a, b) => Number(b.isLate) - Number(a.isLate));

  const totals = {
    toPay: purchases.filter((p) => p.paymentStatus === "to_pay").reduce((s, p) => s + p.amount, 0),
    paid: purchases.filter((p) => p.paymentStatus === "paid").reduce((s, p) => s + p.amount, 0),
    awaiting: purchases.filter((p) => p.status === "awaiting_tracking").length,
    incidents: purchases.filter((p) => p.status === "incident" || p.status === "delayed" || p.isLate).length,
  };

  const stats = [
    { label: "À payer", value: formatCurrency(totals.toPay, "EUR", { decimals: 0 }), icon: CreditCard, tone: "bg-warning-soft text-warning-foreground" },
    { label: "Total payé", value: formatCurrency(totals.paid, "EUR", { decimals: 0 }), icon: CheckCircle2, tone: "bg-success-soft text-success" },
    { label: "En attente de suivi", value: String(totals.awaiting), icon: Truck, tone: "bg-info-soft text-info" },
    { label: "Incidents / retards", value: String(totals.incidents), icon: AlertTriangle, tone: "bg-danger-soft text-danger" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight lg:hidden">Achats &amp; paiements</h1>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="flex items-center gap-3 p-4">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.tone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div>
                {hydrated ? (
                  <div className="text-xl font-semibold tabular-nums">{s.value}</div>
                ) : (
                  <Skeleton className="h-6 w-16" />
                )}
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </Card>
          );
        })}
      </div>

      <Segmented items={tabsWithCounts} value={tab} onChange={setTab} layoutId="payments-tabs" />

      {/* List */}
      {!hydrated ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Rien ici pour le moment"
          description="Aucun achat dans cette catégorie."
          className="mt-6"
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((purchase) => {
            const order = orders.find((o) => o.id === purchase.orderId)!;
            const supplier = suppliers.find((s) => s.id === purchase.supplierId);
            return (
              <PurchaseRow
                key={purchase.id}
                order={order}
                supplier={supplier}
                purchase={purchase}
                onAddTracking={setTrackingOrder}
              />
            );
          })}
        </div>
      )}

      {trackingOrder && (
        <AddTrackingDialog
          order={trackingOrder}
          open={!!trackingOrder}
          onOpenChange={(o) => !o && setTrackingOrder(null)}
        />
      )}
    </div>
  );
}
