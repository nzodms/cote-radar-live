"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Check, Scale, RefreshCw, Truck, Sparkles, MapPin, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/ui/product-image";
import { QuoteCard } from "@/components/orders/QuoteCard";
import { useStore } from "@/lib/store/useStore";
import { getRecommendation, selectQuotesForOrder } from "@/lib/store/selectors";
import { toast } from "@/lib/store/toast";
import { flag, formatCurrency } from "@/lib/utils";
import type { Order, Supplier } from "@/types";

export function OrderContextPanel({ order, supplier }: { order: Order; supplier: Supplier }) {
  const router = useRouter();
  const quotes = useStore((s) => s.quotes);
  const suppliers = useStore((s) => s.suppliers);
  const rules = useStore((s) => s.rules);
  const selectSupplierForOrder = useStore((s) => s.selectSupplierForOrder);
  const sendMerchantMessage = useStore((s) => s.sendMerchantMessage);
  const requestTracking = useStore((s) => s.requestTracking);
  const conversations = useStore((s) => s.conversations);

  const quote = quotes.find((q) => q.orderId === order.id && q.supplierId === supplier.id) ?? null;
  const recommendation = useMemo(
    () => getRecommendation({ quotes, suppliers, rules }, order),
    [order, quotes, suppliers, rules],
  );
  const orderQuoteCount = selectQuotesForOrder(quotes, order.id).length;

  const isSelected = order.selectedSupplierId === supplier.id;
  const isRecommended = recommendation.recommendedSupplierId === supplier.id;

  const handleSelect = () => {
    selectSupplierForOrder(order.id, supplier.id);
    toast(`${supplier.name} sélectionné`, { description: order.shopifyOrderNumber, tone: "success" });
  };

  const handleRelance = () => {
    const conv = conversations.find((c) => c.orderId === order.id && c.supplierId === supplier.id);
    if (conv) {
      sendMerchantMessage(conv.id, "Bonjour, je me permets de relancer concernant ma demande. Merci !");
      toast("Relance envoyée", { tone: "success" });
    }
  };

  const handleTracking = () => {
    requestTracking(order.id);
    toast("Demande de suivi envoyée", { description: order.shopifyOrderNumber, tone: "success" });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-border/70 px-4 py-3">
        <h3 className="text-sm font-semibold">Détails de la commande</h3>
      </div>

      <div className="space-y-5 p-4">
        {/* Product */}
        <div>
          <ProductImage src={order.productImage} alt={order.productName} className="aspect-[4/3] w-full" rounded="rounded-2xl" />
          <div className="mt-3 flex items-center gap-2">
            <Badge tone="neutral" size="sm">{order.shopifyOrderNumber}</Badge>
            <span className="text-2xs text-muted-foreground">
              {flag(order.countryCode)} {order.country}
            </span>
          </div>
          <h4 className="mt-1.5 font-semibold leading-tight">{order.productName}</h4>
          <p className="text-sm text-muted-foreground">{order.variant}</p>
        </div>

        {/* Pricing */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border bg-secondary/30 p-3">
            <div className="text-2xs text-muted-foreground">Prix de vente</div>
            <div className="text-sm font-semibold">{formatCurrency(order.salePrice)}</div>
          </div>
          <div className="rounded-xl border border-border bg-secondary/30 p-3">
            <div className="flex items-center gap-1 text-2xs text-muted-foreground">
              <MapPin className="h-3 w-3" /> Coût cible
            </div>
            <div className="text-sm font-semibold">{formatCurrency(order.targetMaxCost)}</div>
          </div>
        </div>

        {/* Recommendation */}
        {isRecommended && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary-soft/60 px-3 py-2 text-xs font-medium text-primary">
            <Sparkles className="h-4 w-4 shrink-0" />
            Recommandé par l&apos;IA pour cette commande
          </div>
        )}

        {/* Quote */}
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Devis de {supplier.name}
          </div>
          {quote ? (
            <QuoteCard quote={quote} salePrice={order.salePrice} quantity={order.quantity} />
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-secondary/30 px-3 py-3 text-xs text-muted-foreground">
              <Inbox className="h-4 w-4" />
              Aucun devis. Utilisez « Simuler réponse » pour en extraire un.
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-1">
          <Button className="w-full" onClick={handleSelect} disabled={isSelected} variant={isSelected ? "secondary" : "default"}>
            <Check className="h-4 w-4" />
            {isSelected ? "Fournisseur sélectionné" : "Sélectionner ce fournisseur"}
          </Button>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" onClick={handleRelance}>
              <RefreshCw className="h-3.5 w-3.5" />
              Relancer
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/comparison?order=${order.id}`)}
              disabled={orderQuoteCount < 2}
            >
              <Scale className="h-3.5 w-3.5" />
              Comparer
            </Button>
            <Button variant="outline" size="sm" onClick={handleTracking}>
              <Truck className="h-3.5 w-3.5" />
              Suivi
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
