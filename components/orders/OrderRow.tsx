"use client";

import { ChevronRight, Sparkles, Star } from "lucide-react";
import { ProductImage } from "@/components/ui/product-image";
import { OrderStatusBadge } from "@/components/ui/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn, flag, formatCurrency } from "@/lib/utils";
import type { Order, Supplier, SupplierQuote } from "@/types";

export function OrderListHeader() {
  return (
    <div className="hidden items-center gap-3 border-b border-border px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground lg:flex">
      <span className="w-11" />
      <span className="flex-1">Produit</span>
      <span className="w-24">Pays</span>
      <span className="w-24 text-right">Prix vente</span>
      <span className="w-24 text-right">Coût cible</span>
      <span className="w-36">Recommandé</span>
      <span className="w-16 text-center">Devis</span>
      <span className="w-28">Statut</span>
      <span className="w-5" />
    </div>
  );
}

export function OrderRow({
  order,
  suppliers,
  quotes,
  onClick,
}: {
  order: Order;
  suppliers: Supplier[];
  quotes: SupplierQuote[];
  onClick: () => void;
}) {
  const quoteCount = quotes.filter((q) => q.orderId === order.id).length;
  const recommended = suppliers.find(
    (s) => s.id === (order.selectedSupplierId ?? order.recommendedSupplierId),
  );

  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-secondary/50"
    >
      <ProductImage src={order.productImage} alt={order.productName} className="h-11 w-11 shrink-0" rounded="rounded-lg" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">{order.shopifyOrderNumber}</span>
          <span className="text-2xs text-muted-foreground/70 lg:hidden">
            {flag(order.countryCode)} {order.country}
          </span>
        </div>
        <div className="truncate text-sm font-medium">{order.productName}</div>
        <div className="truncate text-2xs text-muted-foreground">{order.variant}</div>
      </div>

      <span className="hidden w-24 items-center gap-1 text-sm text-muted-foreground lg:flex">
        {flag(order.countryCode)} {order.country}
      </span>
      <span className="hidden w-24 text-right text-sm font-semibold tabular-nums lg:block">
        {formatCurrency(order.salePrice)}
      </span>
      <span className="hidden w-24 text-right text-sm tabular-nums text-muted-foreground lg:block">
        {formatCurrency(order.targetMaxCost)}
      </span>

      <span className="hidden w-36 lg:flex">
        {recommended ? (
          <span className="flex items-center gap-1.5">
            <Avatar initials={recommended.initials} seed={recommended.id} size="sm" className="!h-6 !w-6" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="flex items-center gap-1 truncate text-xs font-medium">
                {recommended.name}
                {order.recommendedSupplierId === recommended.id && !order.selectedSupplierId && (
                  <Sparkles className="h-3 w-3 shrink-0 text-primary" />
                )}
                {recommended.preferred && <Star className="h-2.5 w-2.5 shrink-0 fill-amber-400 text-amber-400" />}
              </span>
            </span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </span>

      <span className="hidden w-16 justify-center lg:flex">
        {quoteCount > 0 ? (
          <Badge tone="info" size="sm">{quoteCount}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground/60">0</span>
        )}
      </span>

      <span className="w-28">
        <OrderStatusBadge status={order.status} />
      </span>

      <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5")} />
    </button>
  );
}
