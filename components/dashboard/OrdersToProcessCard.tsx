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
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary-soft"
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
                    <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                      <span className="font-semibold">{order.shopifyOrderNumber}</span>
                      <span aria-hidden>·</span>
                      <span className="truncate">
                        {flag(order.countryCode)} {order.country}
                      </span>
                    </div>
                    <div className="truncate text-sm font-medium">{order.productName}</div>
                  </div>

                  {/* quotes */}
                  <div className="hidden w-[68px] justify-end sm:flex">
                    {quoteCount > 0 ? (
                      <Badge tone="info" size="sm">{quoteCount} devis</Badge>
                    ) : (
                      <Badge tone="neutral" size="sm">0 devis</Badge>
                    )}
                  </div>

                  {/* recommended supplier */}
                  <div className="hidden w-7 justify-center md:flex">
                    {recommended ? (
                      <Tooltip content={`Recommandé : ${recommended.name}`}>
                        <span className="relative">
                          <Avatar initials={recommended.initials} seed={recommended.id} size="sm" className="!h-6 !w-6 text-[9px]" />
                          <Sparkles className="absolute -right-1 -top-1 h-2.5 w-2.5 text-primary" />
                        </span>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </div>

                  <div className="hidden w-20 text-right text-sm font-semibold tabular-nums md:block">
                    {formatCurrency(order.salePrice)}
                  </div>

                  <div className="hidden w-[104px] justify-end lg:flex">
                    <OrderStatusBadge status={order.status} />
                  </div>

                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
