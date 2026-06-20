"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight, Sparkles, Inbox } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductImage } from "@/components/ui/product-image";
import { OrderStatusBadge } from "@/components/ui/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { flag, formatCurrency } from "@/lib/utils";
import type { Order, Supplier, SupplierQuote } from "@/types";

export function OrdersToProcessCard({
  orders,
  suppliers,
  quotes,
  onOpenOrder,
}: {
  orders: Order[];
  suppliers: Supplier[];
  quotes: SupplierQuote[];
  onOpenOrder: (id: string) => void;
}) {
  const toProcess = orders
    .filter((o) => o.status === "awaiting_reply" || o.status === "quoted")
    .slice(0, 6);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Commandes à traiter</CardTitle>
          <p className="text-sm text-muted-foreground">Devis à demander ou à comparer</p>
        </div>
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary-deep"
        >
          Voir tout
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardHeader>

      <div className="px-2 pb-2">
        {toProcess.length === 0 ? (
          <EmptyState icon={Inbox} title="Tout est à jour" description="Aucune commande en attente de traitement." className="m-3" />
        ) : (
          <div className="space-y-0.5">
            {toProcess.map((order) => {
              const quoteCount = quotes.filter((q) => q.orderId === order.id).length;
              const recommended = suppliers.find((s) => s.id === order.recommendedSupplierId);
              return (
                <button
                  key={order.id}
                  onClick={() => onOpenOrder(order.id)}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary/60"
                >
                  <ProductImage src={order.productImage} alt={order.productName} className="h-11 w-11 shrink-0" rounded="rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">{order.shopifyOrderNumber}</span>
                      <span className="text-2xs text-muted-foreground">
                        {flag(order.countryCode)} {order.country}
                      </span>
                    </div>
                    <div className="truncate text-sm font-medium">{order.productName}</div>
                  </div>

                  <div className="hidden items-center gap-2 sm:flex">
                    {quoteCount > 0 ? (
                      <Badge tone="info" size="sm">{quoteCount} devis</Badge>
                    ) : (
                      <Badge tone="neutral" size="sm">En attente</Badge>
                    )}
                    {recommended && (
                      <Tooltip content={`Recommandé : ${recommended.name}`}>
                        <span className="flex items-center gap-1 rounded-full bg-primary-soft px-1.5 py-0.5">
                          <Sparkles className="h-3 w-3 text-primary" />
                          <Avatar initials={recommended.initials} seed={recommended.id} size="sm" className="!h-5 !w-5" />
                        </span>
                      </Tooltip>
                    )}
                  </div>

                  <div className="hidden w-20 text-right text-sm font-semibold tabular-nums md:block">
                    {formatCurrency(order.salePrice)}
                  </div>
                  <OrderStatusBadge status={order.status} className="hidden lg:inline-flex" />
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
