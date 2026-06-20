"use client";

import { useState } from "react";
import { Package, Hourglass, CreditCard, Truck, AlertTriangle, ShieldCheck } from "lucide-react";
import { useStore } from "@/lib/store/useStore";
import { computeKpis, useHydrated } from "@/lib/store/selectors";
import { formatCurrency } from "@/lib/utils";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { OrdersToProcessCard } from "@/components/dashboard/OrdersToProcessCard";
import { AiSuggestionsCard } from "@/components/dashboard/AiSuggestionsCard";
import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import { RecommendedSuppliers } from "@/components/dashboard/RecommendedSuppliers";
import { OrderDetailSheet } from "@/components/orders/OrderDetailSheet";

export default function DashboardPage() {
  const hydrated = useHydrated();
  const orders = useStore((s) => s.orders);
  const suppliers = useStore((s) => s.suppliers);
  const quotes = useStore((s) => s.quotes);
  const conversations = useStore((s) => s.conversations);
  const rules = useStore((s) => s.rules);
  const activity = useStore((s) => s.activity);

  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const kpis = computeKpis({ orders, conversations, quotes });
  const loading = !hydrated;

  const today = hydrated
    ? new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    : "";

  const kpiCards = [
    {
      label: "Commandes à traiter",
      value: String(kpis.ordersToProcess),
      icon: Package,
      tone: "primary" as const,
      trend: "+2",
      trendGood: false,
      spark: [3, 4, 3, 5, 4, 6, kpis.ordersToProcess || 4],
      href: "/orders",
    },
    {
      label: "Réponses en attente",
      value: String(kpis.awaitingReplies),
      icon: Hourglass,
      tone: "info" as const,
      spark: [2, 1, 3, 2, 3, 2, kpis.awaitingReplies || 2],
      href: "/inbox",
    },
    {
      label: "En attente de paiement",
      value: String(kpis.awaitingPayment),
      icon: CreditCard,
      tone: "warning" as const,
      spark: [1, 2, 1, 2, 1, 1, kpis.awaitingPayment || 1],
      href: "/payments",
    },
    {
      label: "En attente de suivi",
      value: String(kpis.awaitingTracking),
      icon: Truck,
      tone: "info" as const,
      spark: [2, 1, 2, 1, 2, 1, kpis.awaitingTracking || 1],
      href: "/payments",
    },
    {
      label: "Expéditions en retard",
      value: String(kpis.lateShipments),
      icon: AlertTriangle,
      tone: "danger" as const,
      trend: kpis.lateShipments > 0 ? `${kpis.lateShipments}` : undefined,
      trendUp: true,
      trendGood: false,
      spark: [0, 1, 0, 1, 2, 1, kpis.lateShipments || 2],
      href: "/payments",
    },
    {
      label: "Marge protégée estimée",
      value: formatCurrency(kpis.protectedMargin, "EUR", { decimals: 0 }),
      icon: ShieldCheck,
      tone: "violet" as const,
      trend: "+18 %",
      trendGood: true,
      spark: [420, 510, 480, 620, 700, 760, 820],
      href: "/comparison",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bonjour Emma 👋</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? (
              <span className="inline-block h-4 w-64 align-middle">
                <span className="skeleton block h-4 w-64 rounded" />
              </span>
            ) : (
              <>
                <span className="capitalize">{today}</span> · {kpis.ordersToProcess} commande
                {kpis.ordersToProcess > 1 ? "s" : ""} à traiter, {kpis.awaitingReplies} réponse
                {kpis.awaitingReplies > 1 ? "s" : ""} en attente.
              </>
            )}
          </p>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {kpiCards.map((kpi, i) => (
          <KpiCard key={kpi.label} {...kpi} loading={loading} index={i} />
        ))}
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <OrdersToProcessCard
            orders={orders}
            suppliers={suppliers}
            quotes={quotes}
            onOpenOrder={setOpenOrderId}
          />
          <AiSuggestionsCard
            orders={orders}
            suppliers={suppliers}
            quotes={quotes}
            conversations={conversations}
            rules={rules}
            onOpenOrder={setOpenOrderId}
          />
        </div>
        <div className="space-y-6">
          <ActivityTimeline activity={activity} />
          <RecommendedSuppliers suppliers={suppliers} />
        </div>
      </div>

      <OrderDetailSheet orderId={openOrderId} onOpenChange={(o) => !o && setOpenOrderId(null)} />
    </div>
  );
}
