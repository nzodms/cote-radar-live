"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquarePlus,
  Scale,
  CreditCard,
  Truck,
  Sparkles,
  Star,
  Check,
  ArrowUpRight,
  MapPin,
  Target,
  Tag,
  Inbox,
} from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/ui/product-image";
import { OrderStatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { QuoteCard } from "./QuoteCard";
import { ContactSuppliersDialog } from "./ContactSuppliersDialog";
import { AddTrackingDialog } from "./AddTrackingDialog";
import { cn, flag, formatCurrency } from "@/lib/utils";
import { useStore } from "@/lib/store/useStore";
import { getRecommendation, selectQuotesForOrder } from "@/lib/store/selectors";
import { toast } from "@/lib/store/toast";

export function OrderDetailSheet({
  orderId,
  onOpenChange,
}: {
  orderId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const orders = useStore((s) => s.orders);
  const suppliers = useStore((s) => s.suppliers);
  const quotes = useStore((s) => s.quotes);
  const conversations = useStore((s) => s.conversations);
  const rules = useStore((s) => s.rules);
  const selectSupplierForOrder = useStore((s) => s.selectSupplierForOrder);
  const markPaid = useStore((s) => s.markPaid);

  const [contactOpen, setContactOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);

  const order = orders.find((o) => o.id === orderId) ?? null;

  const orderQuotes = useMemo(
    () => (order ? selectQuotesForOrder(quotes, order.id) : []),
    [quotes, order],
  );
  const recommendation = useMemo(
    () => (order ? getRecommendation({ quotes, suppliers, rules }, order) : null),
    [order, quotes, suppliers, rules],
  );
  const orderConvs = conversations.filter((c) => c.orderId === orderId);
  const supplierById = (id: string) => suppliers.find((s) => s.id === id);

  const handleSelect = (supplierId: string) => {
    if (!order) return;
    selectSupplierForOrder(order.id, supplierId);
    const s = supplierById(supplierId);
    toast(`${s?.name} sélectionné`, {
      description: `${order.shopifyOrderNumber} · prêt pour le paiement`,
      tone: "success",
    });
  };

  const handlePaid = () => {
    if (!order) return;
    markPaid(order.id);
    toast("Paiement enregistré", { description: order.shopifyOrderNumber, tone: "success" });
  };

  return (
    <>
      <Sheet
        open={!!order}
        onOpenChange={onOpenChange}
        size="xl"
        title={order ? <span className="flex items-center gap-2">{order.shopifyOrderNumber}</span> : ""}
        description={order?.productName}
        headerExtra={order ? <OrderStatusBadge status={order.status} /> : null}
        footer={
          order && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setContactOpen(true)} className="flex-1">
                <MessageSquarePlus className="h-4 w-4" />
                Contacter fournisseurs
              </Button>
              {orderQuotes.length >= 2 && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    router.push(`/comparison?order=${order.id}`);
                    onOpenChange(false);
                  }}
                >
                  <Scale className="h-4 w-4" />
                  Comparer
                </Button>
              )}
              {order.selectedSupplierId && order.paymentStatus !== "paid" && (
                <Button variant="secondary" onClick={handlePaid}>
                  <CreditCard className="h-4 w-4" />
                  Marquer payé
                </Button>
              )}
              {order.paymentStatus === "paid" && order.trackingStatus !== "shipped" && (
                <Button variant="secondary" onClick={() => setTrackingOpen(true)}>
                  <Truck className="h-4 w-4" />
                  Ajouter suivi
                </Button>
              )}
            </div>
          )
        }
      >
        {order && (
          <div className="space-y-6">
            {/* Product hero */}
            <div className="flex gap-4">
              <ProductImage src={order.productImage} alt={order.productName} className="h-28 w-28 shrink-0" rounded="rounded-2xl" />
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold leading-tight">{order.productName}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {order.size && <Badge tone="neutral" size="sm">{order.size}</Badge>}
                  {order.color && <Badge tone="neutral" size="sm">{order.color}</Badge>}
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {flag(order.countryCode)} {order.country} · {order.customerName}
                </div>
              </div>
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat icon={Tag} label="Prix de vente" value={formatCurrency(order.salePrice)} />
              <Stat icon={Target} label="Coût cible max" value={formatCurrency(order.targetMaxCost)} />
              <Stat icon={Inbox} label="Devis reçus" value={String(orderQuotes.length)} />
              <Stat
                icon={Sparkles}
                label="Quantité"
                value={`${order.quantity} pc${order.quantity > 1 ? "s" : ""}`}
              />
            </div>

            {/* Recommendation */}
            {recommendation?.recommendedSupplierId && (
              <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary-soft/80 to-accent/40 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Sparkles className="h-4 w-4" />
                  Recommandation IA
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">
                  {recommendation.explanation}
                </p>
              </div>
            )}

            {/* Quotes */}
            <section>
              <div className="mb-2.5 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Devis reçus</h4>
                {orderQuotes.length > 0 && (
                  <span className="text-xs text-muted-foreground">{orderQuotes.length} fournisseur(s)</span>
                )}
              </div>

              {orderQuotes.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="Aucun devis pour le moment"
                  description="Contactez vos fournisseurs pour recevoir des devis à comparer."
                  className="py-10"
                  action={
                    <Button size="sm" onClick={() => setContactOpen(true)}>
                      <MessageSquarePlus className="h-4 w-4" />
                      Contacter fournisseurs
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {orderQuotes.map((quote) => {
                    const supplier = supplierById(quote.supplierId);
                    const isRecommended = quote.supplierId === recommendation?.recommendedSupplierId;
                    const isSelected = quote.supplierId === order.selectedSupplierId;
                    return (
                      <div
                        key={quote.id}
                        className={cn(
                          "rounded-2xl border p-3 transition-all",
                          isSelected
                            ? "border-success/40 bg-success-soft/30"
                            : isRecommended
                              ? "border-primary/30 bg-primary-soft/20"
                              : "border-border bg-secondary/20",
                        )}
                      >
                        <div className="mb-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <Avatar initials={supplier?.initials ?? "?"} seed={quote.supplierId} size="sm" online={supplier?.online} />
                            <div>
                              <div className="flex items-center gap-1.5 text-sm font-medium">
                                {supplier?.name}
                                {supplier?.preferred && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                              </div>
                              <div className="text-2xs text-muted-foreground">
                                Fiabilité {quote.reliabilityScore} · {supplier?.country}
                              </div>
                            </div>
                          </div>
                          {isRecommended && !isSelected && (
                            <Badge tone="primary" size="sm">
                              <Sparkles className="h-3 w-3" /> Recommandé
                            </Badge>
                          )}
                          {isSelected && (
                            <Badge tone="success" size="sm">
                              <Check className="h-3 w-3" /> Sélectionné
                            </Badge>
                          )}
                        </div>
                        <QuoteCard quote={quote} salePrice={order.salePrice} quantity={order.quantity} />
                        {!isSelected && (
                          <Button
                            size="sm"
                            variant={isRecommended ? "default" : "secondary"}
                            className="mt-2.5 w-full"
                            onClick={() => handleSelect(quote.supplierId)}
                          >
                            <Check className="h-4 w-4" />
                            Sélectionner ce fournisseur
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Conversations */}
            {orderConvs.length > 0 && (
              <section>
                <h4 className="mb-2.5 text-sm font-semibold">Conversations</h4>
                <div className="space-y-2">
                  {orderConvs.map((c) => {
                    const supplier = supplierById(c.supplierId);
                    const last = c.messages[c.messages.length - 1];
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          router.push(`/inbox?c=${c.id}`);
                          onOpenChange(false);
                        }}
                        className="flex w-full items-center gap-3 rounded-xl border border-border bg-white p-2.5 text-left transition-colors hover:border-border-strong hover:bg-secondary/40"
                      >
                        <Avatar initials={supplier?.initials ?? "?"} seed={c.supplierId} size="sm" online={supplier?.online} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{supplier?.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {last?.content.split("\n")[0]}
                          </div>
                        </div>
                        {c.unreadCount > 0 && (
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-2xs font-semibold text-white">
                            {c.unreadCount}
                          </span>
                        )}
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground/60" />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </Sheet>

      {order && (
        <>
          <ContactSuppliersDialog order={order} open={contactOpen} onOpenChange={setContactOpen} />
          <AddTrackingDialog order={order} open={trackingOpen} onOpenChange={setTrackingOpen} />
        </>
      )}
    </>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Tag; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3">
      <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
