"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Scale, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { ProductImage } from "@/components/ui/product-image";
import { OrderStatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SupplierComparisonCard } from "@/components/comparison/SupplierComparisonCard";
import { ComparisonMatrix, type ComparisonEntry } from "@/components/comparison/ComparisonMatrix";
import { RecommendationPanel } from "@/components/comparison/RecommendationPanel";
import { useStore } from "@/lib/store/useStore";
import { getRecommendation, selectQuotesForOrder, useHydrated } from "@/lib/store/selectors";
import { toast } from "@/lib/store/toast";
import { flag, formatCurrency } from "@/lib/utils";

function ComparisonContent() {
  const params = useSearchParams();
  const hydrated = useHydrated();
  const orders = useStore((s) => s.orders);
  const suppliers = useStore((s) => s.suppliers);
  const quotes = useStore((s) => s.quotes);
  const rules = useStore((s) => s.rules);
  const selectSupplierForOrder = useStore((s) => s.selectSupplierForOrder);

  const comparable = useMemo(
    () => orders.filter((o) => selectQuotesForOrder(quotes, o.id).length >= 2),
    [orders, quotes],
  );

  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    const fromParam = params.get("order");
    if (fromParam && comparable.some((o) => o.id === fromParam)) setOrderId(fromParam);
    else if (!orderId && comparable.length > 0) setOrderId(comparable[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, comparable.length]);

  const order = orders.find((o) => o.id === orderId) ?? null;

  const recommendation = useMemo(
    () => (order ? getRecommendation({ quotes, suppliers, rules }, order) : null),
    [order, quotes, suppliers, rules],
  );

  const entries: ComparisonEntry[] = useMemo(() => {
    if (!order || !recommendation) return [];
    return recommendation.scores
      .map((score) => {
        const supplier = suppliers.find((s) => s.id === score.supplierId);
        const quote = quotes.find((q) => q.id === score.quoteId);
        if (!supplier || !quote) return null;
        return { supplier, quote, score };
      })
      .filter((e): e is ComparisonEntry => e !== null);
  }, [order, recommendation, suppliers, quotes]);

  if (!hydrated) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-28 rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (comparable.length === 0 || !order) {
    return (
      <EmptyState
        icon={Scale}
        title="Aucun devis à comparer"
        description="Contactez plusieurs fournisseurs pour une même commande afin de comparer leurs devis ici."
        className="mt-10"
      />
    );
  }

  const handleSelect = (supplierId: string) => {
    selectSupplierForOrder(order.id, supplierId);
    const s = suppliers.find((x) => x.id === supplierId);
    toast(`${s?.name} sélectionné`, { description: `${order.shopifyOrderNumber} · prêt pour paiement`, tone: "success" });
  };

  return (
    <div className="space-y-6">
      {/* Order selector */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight lg:hidden">Comparaison</h1>
        <div className="ml-auto w-full max-w-xs">
          <Select value={order.id} onChange={(e) => setOrderId(e.target.value)}>
            {comparable.map((o) => (
              <option key={o.id} value={o.id}>
                {o.shopifyOrderNumber} — {o.productName}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Order summary */}
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <ProductImage src={order.productImage} alt={order.productName} className="h-20 w-20 shrink-0" rounded="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">{order.shopifyOrderNumber}</span>
            <OrderStatusBadge status={order.status} />
          </div>
          <h2 className="mt-0.5 text-lg font-semibold leading-tight">{order.productName}</h2>
          <p className="text-sm text-muted-foreground">
            {flag(order.countryCode)} {order.country} · {order.variant}
          </p>
        </div>
        <div className="flex gap-6">
          <div>
            <div className="text-2xs uppercase tracking-wider text-muted-foreground">Prix vente</div>
            <div className="text-lg font-semibold tabular-nums">{formatCurrency(order.salePrice)}</div>
          </div>
          <div>
            <div className="text-2xs uppercase tracking-wider text-muted-foreground">Coût cible</div>
            <div className="text-lg font-semibold tabular-nums">{formatCurrency(order.targetMaxCost)}</div>
          </div>
          <div>
            <div className="text-2xs uppercase tracking-wider text-muted-foreground">Devis</div>
            <div className="text-lg font-semibold tabular-nums">{entries.length}</div>
          </div>
        </div>
      </Card>

      {/* Supplier cards */}
      <div className="grid gap-4 pt-2 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((e, i) => (
          <SupplierComparisonCard
            key={e.supplier.id}
            order={order}
            supplier={e.supplier}
            quote={e.quote}
            score={e.score}
            isRecommended={e.supplier.id === recommendation?.recommendedSupplierId}
            isSelected={e.supplier.id === order.selectedSupplierId}
            onSelect={() => handleSelect(e.supplier.id)}
            index={i}
          />
        ))}
      </div>

      {/* Matrix + recommendation */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ComparisonMatrix entries={entries} recommendedId={recommendation?.recommendedSupplierId ?? null} />
        </div>
        <div>
          {recommendation && <RecommendationPanel recommendation={recommendation} suppliers={suppliers} />}
        </div>
      </div>
    </div>
  );
}

export default function ComparisonPage() {
  return (
    <Suspense fallback={<div className="h-96 w-full animate-pulse rounded-2xl bg-muted/50" />}>
      <ComparisonContent />
    </Suspense>
  );
}
